import Server, { calculateTokenCount, TokenizerService } from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { homedir } from "os";
import {
  getPresetDir,
  readManifestFromDir,
  manifestToPresetFile,
  saveManifest,
  isPresetInstalled,
  extractPreset,
  HOME_DIR,
  extractMetadata,
  loadConfigFromManifest,
  downloadPresetToTemp,
  getTempDir,
  findMarketPresetByName,
  getMarketPresets,
  type PresetFile,
  type ManifestFile,
  type PresetMetadata,
} from "@CCR/shared";
import fastifyMultipart from "@fastify/multipart";
import AdmZip from "adm-zip";
import { registerCodexAuthRoutes } from "./routes/codex-auth";

const FETCH_MODELS_TIMEOUT_MS = 15000;

const FETCH_MODELS_ERRORS = {
  MISSING_BASE_URL: { code: 'MISSING_BASE_URL' as const, message: 'API Base URL is required' },
  MISSING_API_KEY: { code: 'MISSING_API_KEY' as const, message: 'API Key is required' },
  INVALID_BASE_URL: { code: 'INVALID_BASE_URL' as const, message: 'Invalid base URL. Please check the address.' },
  AUTH_FAILED: { code: 'AUTH_FAILED' as const, message: 'Authentication failed. Please check your API Key.' },
  ENDPOINT_NOT_FOUND: { code: 'ENDPOINT_NOT_FOUND' as const, message: 'This provider does not support fetching model list.' },
  TIMEOUT: { code: 'TIMEOUT' as const, message: 'Request timeout. Please try again.' },
  NETWORK_ERROR: { code: 'NETWORK_ERROR' as const, message: 'Network error. Please check your connection.' },
  UNKNOWN: { code: 'UNKNOWN' as const, message: 'Failed to fetch models.' },
} as const;

const COMPAT_SUFFIXES = [
  '/api/claudecode',
  '/api/anthropic',
  '/apps/anthropic',
  '/api/coding',
  '/claudecode',
  '/anthropic',
  '/step_plan',
  '/coding',
  '/claude',
] as const;

function validateBaseUrl(baseUrl: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, error: 'Unsupported protocol. Only HTTP/HTTPS are allowed.' };
  }

  if (url.username || url.password) {
    return { valid: false, error: 'URL must not contain credentials' };
  }

  return { valid: true };
}

function isGeminiUrl(url: string): boolean {
  return url.includes('generativelanguage.googleapis.com');
}

function appendApiKeyToUrl(url: string, apiKey: string): string {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set('key', apiKey);
  return parsedUrl.toString();
}

function buildModelsUrlCandidates(baseUrl: string): string[] {
  const trimmed = baseUrl.trim().replace(/\/+/g, '/').replace(/\/$/, '');
  const candidates = new Set<string>();

  if (isGeminiUrl(trimmed)) {
    const root = trimmed.replace(/\/(v1beta|v1|v1alpha)(\/models)?$/, '');
    candidates.add(`${root}/v1beta/models`);
    candidates.add(`${root}/v1/models`);
    candidates.add(`${root}/models`);
    return Array.from(candidates);
  }

  if (trimmed.match(/\/(v1\/)?chat\/completions$/)) {
    const root = trimmed.replace(/\/(v1\/)?chat\/completions$/, '');
    candidates.add(`${root}/v1/models`);
    candidates.add(`${root}/models`);
  } else if (trimmed.endsWith('/completions')) {
    const root = trimmed.replace(/\/completions$/, '');
    candidates.add(`${root}/v1/models`);
  } else if (trimmed.endsWith('/v1')) {
    candidates.add(`${trimmed}/models`);
  } else if (trimmed.includes('/v1beta/models')) {
    candidates.add(trimmed);
  } else {
    candidates.add(`${trimmed}/v1/models`);
    candidates.add(`${trimmed}/models`);
  }

  for (const suffix of COMPAT_SUFFIXES) {
    const idx = trimmed.indexOf(suffix);
    if (idx !== -1) {
      const root = trimmed.substring(0, idx);
      if (root) {
        candidates.add(`${root}/v1/models`);
        candidates.add(`${root}/models`);
      }
    }
  }

  return Array.from(candidates);
}

export const createServer = async (config: any): Promise<any> => {
  const server = new Server(config);
  const app = server.app;

  // Intercept all fetch calls to log provider interactions
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const options = args[1] || {};

    // Filter out localhost/internal requests to reduce noise
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return originalFetch(...args);
    }

    app.log.debug({
      url,
      method: options.method || 'GET',
      headers: options.headers,
    }, 'Upstream Provider Request');

    try {
      const response = await originalFetch(...args);
      const clonedResponse = response.clone();

      app.log.debug({
        url,
        status: response.status,
        headers: Object.fromEntries(clonedResponse.headers.entries()),
      }, 'Upstream Provider Response');

      if (response.status >= 400) {
        const errorBody = await clonedResponse.text();
        app.log.error({
          url,
          status: response.status,
          body: errorBody,
        }, 'Upstream Provider Error Body');
      }

      return response;
    } catch (error) {
      app.log.error({
        url,
        error: error instanceof Error ? error.message : String(error),
      }, 'Upstream Provider Fetch Exception');
      throw error;
    }
  };

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Register Codex OAuth callback routes
  await registerCodexAuthRoutes(app);

  app.post("/v1/messages/count_tokens", async (req: any, reply: any) => {
    const { messages, tools, system, model } = req.body;
    const tokenizerService = (app as any)._server!.tokenizerService as TokenizerService;

    // If model is specified in "providerName,modelName" format, use the configured tokenizer
    if (model && model.includes(",") && tokenizerService) {
      try {
        const [provider, modelName] = model.split(",");
        req.log?.info(`Looking up tokenizer for provider: ${provider}, model: ${modelName}`);

        const tokenizerConfig = tokenizerService.getTokenizerConfigForModel(provider, modelName);

        if (!tokenizerConfig) {
          req.log?.warn(`No tokenizer config found for ${provider},${modelName}, using default tiktoken`);
        } else {
          req.log?.info(`Using tokenizer config: ${JSON.stringify(tokenizerConfig)}`);
        }

        const result = await tokenizerService.countTokens(
          { messages, system, tools },
          tokenizerConfig
        );

        return {
          "input_tokens": result.tokenCount,
          "tokenizer": result.tokenizerUsed,
        };
      } catch (error: any) {
        req.log?.error(`Error using configured tokenizer: ${error.message}`);
        req.log?.error(error.stack);
        // Fall back to default calculation
      }
    } else {
      if (!model) {
        req.log?.info(`No model specified, using default tiktoken`);
      } else if (!model.includes(",")) {
        req.log?.info(`Model "${model}" does not contain comma, using default tiktoken`);
      } else if (!tokenizerService) {
        req.log?.warn(`TokenizerService not available, using default tiktoken`);
      }
    }

    // Default to tiktoken calculation
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  app.get("/api/config", async (req: any, reply: any) => {
    return await readConfigFile(false);
  });

  app.get("/api/transformers", async (req: any, reply: any) => {
    const transformers =
      (app as any)._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  app.post("/api/config", async (req: any, reply: any) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      app.log.info(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Register static file serving with caching
  app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  app.get("/ui", async (_: any, reply: any) => {
    return reply.redirect("/ui/");
  });

  // Get log file list endpoint
  app.get("/api/logs/files", async (req: any, reply: any) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // Sort by modification time in descending order
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      app.log.error({ err: error }, "Failed to get log files");
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // Get log content endpoint
  app.get("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If file path is not specified, use default log file path
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      app.log.error({ err: error }, "Failed to get logs");
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // Clear log content endpoint
  app.delete("/api/logs", async (req: any, reply: any) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If file path is not specified, use default log file path
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      app.log.error({ err: error }, "Failed to clear logs");
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // Get presets list
  app.get("/api/presets", async (req: any, reply: any) => {
    try {
      const presetsDir = join(HOME_DIR, "presets");

      if (!existsSync(presetsDir)) {
        return { presets: [] };
      }

      const entries = readdirSync(presetsDir, { withFileTypes: true });
      const presetDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);

      const presets: Array<PresetMetadata & { installed: boolean; id: string }> = [];

      for (const dirName of presetDirs) {
        const presetDir = join(presetsDir, dirName);
        try {
          const manifestPath = join(presetDir, "manifest.json");
          const content = readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(content);

          // Extract metadata fields
          const { Providers, Router, PORT, HOST, API_TIMEOUT_MS, PROXY_URL, LOG, LOG_LEVEL, StatusLine, NON_INTERACTIVE_MODE, ...metadata } = manifest;

          presets.push({
            id: dirName,  // Use directory name as unique identifier
            name: metadata.name || dirName,
            version: metadata.version || '1.0.0',
            description: metadata.description,
            author: metadata.author,
            homepage: metadata.homepage,
            repository: metadata.repository,
            license: metadata.license,
            keywords: metadata.keywords,
            ccrVersion: metadata.ccrVersion,
            source: metadata.source,
            sourceType: metadata.sourceType,
            checksum: metadata.checksum,
            installed: true,
          });
        } catch (error) {
          app.log.error({ err: error }, `Failed to read preset ${dirName}`);
        }
      }

      return { presets };
    } catch (error) {
      app.log.error({ err: error }, "Failed to get presets");
      reply.status(500).send({ error: "Failed to get presets" });
    }
  });

  // Get preset details
  app.get("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      const manifest = await readManifestFromDir(presetDir);
      const presetFile = manifestToPresetFile(manifest);

      // Return preset info, config uses the applied userValues configuration
      return {
        ...presetFile,
        config: loadConfigFromManifest(manifest, presetDir),
        userValues: manifest.userValues || {},
      };
    } catch (error: any) {
      app.log.error({ err: error }, "Failed to get preset");
      reply.status(500).send({ error: error.message || "Failed to get preset" });
    }
  });

  // Apply preset (configure sensitive information)
  app.post("/api/presets/:name/apply", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const { secrets } = req.body;

      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // Read existing manifest
      const manifest = await readManifestFromDir(presetDir);

      // Save user input to userValues (keep original config unchanged)
      const updatedManifest: ManifestFile = { ...manifest };

      // Save or update userValues
      if (secrets && Object.keys(secrets).length > 0) {
        updatedManifest.userValues = {
          ...updatedManifest.userValues,
          ...secrets,
        };
      }

      // Save updated manifest
      await saveManifest(name, updatedManifest);

      return { success: true, message: "Preset applied successfully" };
    } catch (error: any) {
      app.log.error({ err: error }, "Failed to apply preset");
      reply.status(500).send({ error: error.message || "Failed to apply preset" });
    }
  });

  // Delete preset
  app.delete("/api/presets/:name", async (req: any, reply: any) => {
    try {
      const { name } = req.params;
      const presetDir = getPresetDir(name);

      if (!existsSync(presetDir)) {
        reply.status(404).send({ error: "Preset not found" });
        return;
      }

      // Recursively delete entire directory
      rmSync(presetDir, { recursive: true, force: true });

      return { success: true, message: "Preset deleted successfully" };
    } catch (error: any) {
      app.log.error({ err: error }, "Failed to delete preset");
      reply.status(500).send({ error: error.message || "Failed to delete preset" });
    }
  });

  // Get preset market list
  app.get("/api/presets/market", async (req: any, reply: any) => {
    try {
      // Use market presets function
      const marketPresets = await getMarketPresets();
      return { presets: marketPresets };
    } catch (error: any) {
      app.log.error({ err: error }, "Failed to get market presets");
      reply.status(500).send({ error: error.message || "Failed to get market presets" });
    }
  });

  // Install preset from GitHub repository by preset name
  app.post("/api/presets/install/github", async (req: any, reply: any) => {
    try {
      const { presetName } = req.body;

      if (!presetName) {
        reply.status(400).send({ error: "Preset name is required" });
        return;
      }

      // Check if preset is in the marketplace
      const marketPreset = await findMarketPresetByName(presetName);
      if (!marketPreset) {
        reply.status(400).send({
          error: "Preset not found in marketplace",
          message: `Preset '${presetName}' is not available in the official marketplace. Please check the available presets.`
        });
        return;
      }

      // Get repository from market preset
      if (!marketPreset.repo) {
        reply.status(400).send({
          error: "Invalid preset data",
          message: `Preset '${presetName}' does not have repository information`
        });
        return;
      }

      // Parse GitHub repository URL
      const githubRepoMatch = marketPreset.repo.match(/(?:github\.com[:/]|^)([^/]+)\/([^/\s#]+?)(?:\.git)?$/);
      if (!githubRepoMatch) {
        reply.status(400).send({ error: "Invalid GitHub repository URL" });
        return;
      }

      const [, owner, repoName] = githubRepoMatch;

      // Use preset name from market
      const installedPresetName = marketPreset.name || presetName;

      // Check if already installed BEFORE downloading
      if (await isPresetInstalled(installedPresetName)) {
        reply.status(409).send({
          error: "Preset already installed",
          message: `Preset '${installedPresetName}' is already installed. To update or reconfigure, please delete it first using the delete button.`,
          presetName: installedPresetName
        });
        return;
      }

      // Download GitHub repository ZIP file
      const downloadUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
      const tempFile = await downloadPresetToTemp(downloadUrl);

      // Load preset to validate structure
      const preset = await loadPresetFromZip(tempFile);

      // Double-check if already installed (in case of race condition)
      if (await isPresetInstalled(installedPresetName)) {
        unlinkSync(tempFile);
        reply.status(409).send({
          error: "Preset already installed",
          message: `Preset '${installedPresetName}' was installed while downloading. Please try again.`,
          presetName: installedPresetName
        });
        return;
      }

      // Extract to target directory
      const targetDir = getPresetDir(installedPresetName);
      await extractPreset(tempFile, targetDir);

      // Read manifest and add repo information
      const manifest = await readManifestFromDir(targetDir);

      // Add repo information to manifest from market data
      manifest.repository = marketPreset.repo;
      if (marketPreset.url) {
        manifest.source = marketPreset.url;
      }

      // Save updated manifest
      await saveManifest(installedPresetName, manifest);

      // Clean up temp file
      unlinkSync(tempFile);

      return {
        success: true,
        presetName: installedPresetName,
        preset: {
          ...preset.metadata,
          installed: true,
        }
      };
    } catch (error: any) {
      app.log.error({ err: error }, "Failed to install preset from GitHub");
      reply.status(500).send({ error: error.message || "Failed to install preset from GitHub" });
    }
  });

  // Helper function: Load preset from ZIP
  async function loadPresetFromZip(zipFile: string): Promise<PresetFile> {
    const zip = new AdmZip(zipFile);

    // First try to find manifest.json in root directory
    let entry = zip.getEntry('manifest.json');

    // If not in root, try to find in subdirectories (handle GitHub repo archive structure)
    if (!entry) {
      const entries = zip.getEntries();
      // Find any manifest.json file
      entry = entries.find(e => e.entryName.includes('manifest.json')) || null;
    }

    if (!entry) {
      throw new Error('Invalid preset file: manifest.json not found');
    }

    const manifest = JSON.parse(entry.getData().toString('utf-8')) as ManifestFile;
    return manifestToPresetFile(manifest);
  }

  // Fetch models from provider API
  app.post('/api/providers/models', async (req: any, reply: any) => {
    const { baseUrl, apiKey } = req.body || {};

    if (!baseUrl?.trim()) {
      return { success: false, error: { ...FETCH_MODELS_ERRORS.MISSING_BASE_URL } };
    }

    const validation = validateBaseUrl(baseUrl);
    if (!validation.valid) {
      req.log.warn(`SSRF check failed for: ${String(baseUrl).substring(0, 60)}, reason: ${validation.error}`);
      return { success: false, error: { ...FETCH_MODELS_ERRORS.INVALID_BASE_URL } };
    }

    if (!apiKey?.trim()) {
      return { success: false, error: { ...FETCH_MODELS_ERRORS.MISSING_API_KEY } };
    }

    // Resolve environment variable placeholders in apiKey (e.g. $VAR_NAME, ${VAR_NAME})
    const resolvedApiKey = apiKey.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match: string, braced: string, unbraced: string) => {
      const varName = braced || unbraced;
      return process.env[varName] || match;
    });

    const isGemini = isGeminiUrl(baseUrl);
    const candidates = buildModelsUrlCandidates(baseUrl);
    let lastError = '';

    for (const url of candidates) {
      req.log.debug(`Trying models endpoint: ${url}${isGemini ? ' (gemini, key in URL)' : ''}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_MODELS_TIMEOUT_MS);

        const fetchUrl = isGemini ? appendApiKeyToUrl(url, resolvedApiKey) : url;
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (!isGemini) {
          headers['Authorization'] = `Bearer ${resolvedApiKey}`;
        }

        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          let models: Array<{ id: string; ownedBy: string | null }> = [];

          if (isGemini && data.models && Array.isArray(data.models)) {
            models = data.models.map((m: any) => {
              const name: string = String(m.name || '');
              return {
                id: name.startsWith('models/') ? name.slice('models/'.length) : name,
                ownedBy: m.ownedBy || null,
              };
            });
          } else if (data.data && Array.isArray(data.data)) {
            models = data.data.map((m: any) => ({
              id: String(m.id || ''),
              ownedBy: m.owned_by || null,
            }));
          }

          models.sort((a, b) => a.id.localeCompare(b.id));
          return { success: true, models };
        }

        const body = await response.text().catch(() => '').then((t: string) => t.slice(0, 200));

        if (response.status === 401 || response.status === 403) {
          return { success: false, error: { ...FETCH_MODELS_ERRORS.AUTH_FAILED } };
        }

        if (response.status === 404 || response.status === 405) {
          lastError = `HTTP ${response.status}`;
          continue;
        }

        return {
          success: false,
          error: { code: 'UNKNOWN' as const, message: `HTTP ${response.status}: ${body}`.slice(0, 200) },
        };

      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = 'timeout';
          continue;
        }
        return {
          success: false,
          error: { code: 'NETWORK_ERROR' as const, message: String(err.message || err).slice(0, 200) },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'ENDPOINT_NOT_FOUND' as const,
        message: `All endpoints failed: ${lastError}`.slice(0, 200),
      },
    };
  });

  return server;
};
