# API Key Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable providers to rotate through multiple API keys automatically, switching to the next key on 401/429/403 failures.

**Architecture:** A new `ApiKeyPool` class encapsulates round-robin key selection with failure tracking. The pool is created during provider initialization when `api_keys` is present in config. The request sender checks for a pool and retries with the next key on retryable status codes.

**Tech Stack:** TypeScript, esbuild build, branch based on `feat/merge-and-adapt`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/services/api-key-pool.ts` | **Create** | ApiKeyPool class: round-robin selection, failure tracking |
| `packages/core/src/types/llm.ts` | **Modify** | Add `apiKeyPool?` to LLMProvider, `api_keys?` to ConfigProvider |
| `packages/core/src/services/provider.ts` | **Modify** | Create pool when `api_keys` is present; relax validation |
| `packages/core/src/api/routes.ts` | **Modify** | Key rotation retry loop in `sendRequestToProvider` |

---

### Task 1: Create ApiKeyPool Class

**Files:**
- Create: `packages/core/src/services/api-key-pool.ts`

- [ ] **Step 1: Create the ApiKeyPool class**

```typescript
// packages/core/src/services/api-key-pool.ts

export const RETRYABLE_STATUS_CODES = new Set([401, 403, 429]);

export class ApiKeyPool {
  private readonly keys: string[];
  private cursor: number = 0;
  private readonly failed: Set<number> = new Set();

  constructor(keys: string[]) {
    if (!keys.length) {
      throw new Error("ApiKeyPool requires at least one key");
    }
    this.keys = keys;
  }

  getNext(): string {
    const total = this.keys.length;
    for (let i = 0; i < total; i++) {
      const index = (this.cursor + i) % total;
      if (!this.failed.has(index)) {
        this.cursor = (index + 1) % total;
        return this.keys[index];
      }
    }
    throw new Error(
      `All ${total} API keys have been exhausted`
    );
  }

  markFailed(key: string, status: number): void {
    if (!RETRYABLE_STATUS_CODES.has(status)) {
      return;
    }
    const index = this.keys.indexOf(key);
    if (index !== -1) {
      this.failed.add(index);
    }
  }

  getStatus(): { total: number; available: number; failed: number } {
    return {
      total: this.keys.length,
      available: this.keys.length - this.failed.size,
      failed: this.failed.size,
    };
  }
}
```

Note: `RETRYABLE_STATUS_CODES` is exported so `routes.ts` can import it (single source of truth).

- [ ] **Step 2: Verify build**

Run: `pnpm build:server`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/services/api-key-pool.ts
git commit -m "feat: 新增 ApiKeyPool 类，支持多 key 轮询和失效管理"
```

---

### Task 2: Update Types

**Files:**
- Modify: `packages/core/src/types/llm.ts` (lines 14, 208-220, 236-249)

- [ ] **Step 1: Add import and apiKeyPool to LLMProvider**

Add import after line 14 (`import type { ProviderTokenizerConfig }...`):
```typescript
import type { ApiKeyPool } from "../services/api-key-pool";
```

Add `apiKeyPool?` field to LLMProvider (after `apiKey`, before `models`):
```typescript
export interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyPool?: ApiKeyPool;  // new
  models: string[];
  transformer?: { ... };
}
```

- [ ] **Step 2: Add api_keys to ConfigProvider**

Make `api_key` optional and add `api_keys`:
```typescript
export interface ConfigProvider {
  name: string;
  api_base_url: string;
  api_key?: string;       // changed from required to optional
  api_keys?: string[];    // new
  models: string[];
  transformer: { ... };
  tokenizer?: ProviderTokenizerConfig;
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build:server`
Expected: Build succeeds. If making `api_key` optional causes type errors elsewhere, note them — they will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types/llm.ts
git commit -m "feat: LLMProvider 新增 apiKeyPool 可选字段，ConfigProvider 新增 api_keys 可选字段"
```

---

### Task 3: Integrate ApiKeyPool in ProviderService

**Files:**
- Modify: `packages/core/src/services/provider.ts` (lines 1-10, 31-37, 102-108)

- [ ] **Step 1: Add import**

Add after existing imports (line 9):
```typescript
import { ApiKeyPool } from "./api-key-pool";
```

- [ ] **Step 2: Relax validation (line 31-37)**

Change from:
```typescript
        if (
          !providerConfig.name ||
          !providerConfig.api_base_url ||
          !providerConfig.api_key
        ) {
```
To:
```typescript
        if (
          !providerConfig.name ||
          !providerConfig.api_base_url ||
          (!providerConfig.api_key && !providerConfig.api_keys?.length)
        ) {
```

- [ ] **Step 3: Create pool during registration (line 102-108)**

Replace:
```typescript
        this.registerProvider({
          name: providerConfig.name,
          baseUrl: providerConfig.api_base_url,
          apiKey: providerConfig.api_key,
          models: providerConfig.models || [],
          transformer: providerConfig.transformer ? transformer : undefined,
        });
```

With:
```typescript
        let apiKey: string;
        let apiKeyPool: ApiKeyPool | undefined;

        if (providerConfig.api_keys?.length === 1) {
          apiKey = providerConfig.api_keys[0];
        } else if (providerConfig.api_keys && providerConfig.api_keys.length > 1) {
          apiKeyPool = new ApiKeyPool(providerConfig.api_keys);
          apiKey = apiKeyPool.getNext();
        } else {
          apiKey = providerConfig.api_key!;
        }

        this.registerProvider({
          name: providerConfig.name,
          baseUrl: providerConfig.api_base_url,
          apiKey,
          apiKeyPool,
          models: providerConfig.models || [],
          transformer: providerConfig.transformer ? transformer : undefined,
        });
```

- [ ] **Step 4: Verify build**

Run: `pnpm build:server`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/provider.ts
git commit -m "feat: ProviderService 初始化时根据 api_keys 创建 ApiKeyPool"
```

---

### Task 4: Key Rotation in sendRequestToProvider

**Files:**
- Modify: `packages/core/src/api/routes.ts` (lines 1-16, 297-417)

**Important:** The current `sendRequestToProvider` on this branch includes:
- Retry-After header parsing (lines 370-391)
- Structured JSON logging (lines 393-405)
- `createApiError` with 5 args including `headers` (lines 407-413)

ALL of this logic must be preserved in `doSendRequest`.

- [ ] **Step 1: Add import**

Add after line 15 (`import { Transformer } from "@/types/transformer";`):
```typescript
import { RETRYABLE_STATUS_CODES } from "@/services/api-key-pool";
```

- [ ] **Step 2: Replace sendRequestToProvider (lines 297-417)**

Replace from line 297 (`/**\n * Send request to LLM provider`) through line 417 (closing `}` of sendRequestToProvider) with:

```typescript
/**
 * Send request to LLM provider
 * Handles key pool rotation when provider has multiple API keys
 */
async function sendRequestToProvider(
  requestBody: any,
  config: any,
  provider: any,
  fastify: FastifyInstance,
  bypass: boolean,
  transformer: any,
  context: any
) {
  const pool = provider.apiKeyPool;

  if (pool) {
    return sendWithKeyPool(requestBody, config, provider, fastify, bypass, transformer, context, pool);
  }

  return doSendRequest(requestBody, config, provider, provider.apiKey, fastify, bypass, transformer, context);
}

/**
 * Send request with automatic key rotation on retryable failures
 * Tries each available key in the pool until one succeeds or all are exhausted
 */
async function sendWithKeyPool(
  requestBody: any,
  config: any,
  provider: any,
  fastify: FastifyInstance,
  bypass: boolean,
  transformer: any,
  context: any,
  pool: any
) {
  const totalKeys = pool.getStatus().total;
  let lastError: any;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const apiKey = pool.getNext();

    try {
      const response = await doSendRequest(requestBody, config, provider, apiKey, fastify, bypass, transformer, context);
      return response;
    } catch (error: any) {
      if (error.statusCode && RETRYABLE_STATUS_CODES.has(error.statusCode)) {
        fastify.log.warn(
          `[key_pool] Key for provider ${provider.name} returned ${error.statusCode}, rotating to next key`
        );
        pool.markFailed(apiKey, error.statusCode);
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  const poolStatus = pool.getStatus();
  fastify.log.error(
    `[key_pool] All ${poolStatus.total} keys exhausted for provider ${provider.name}`
  );
  throw createApiError(
    `All API keys exhausted for provider ${provider.name}`,
    lastError?.statusCode || 429,
    "api_keys_exhausted",
    "api_error",
    lastError?.headers
  );
}

/**
 * Core request sending logic for a single API key
 * Handles authentication, headers, Retry-After parsing, and error responses
 */
async function doSendRequest(
  requestBody: any,
  config: any,
  provider: any,
  apiKey: string,
  fastify: FastifyInstance,
  bypass: boolean,
  transformer: any,
  context: any
) {
  const url = config.url || new URL(provider.baseUrl);

  // Handle authentication in passthrough mode
  if (bypass && typeof transformer.auth === "function") {
    const auth = await transformer.auth(requestBody, provider);
    if (auth.body) {
      requestBody = auth.body;
      let headers = config.headers || {};
      if (auth.config?.headers) {
        headers = {
          ...headers,
          ...auth.config.headers,
        };
        delete headers.host;
        delete auth.config.headers;
      }
      config = {
        ...config,
        ...auth.config,
        headers,
      };
    } else {
      requestBody = auth;
    }
  }

  // Prepare headers
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...(config?.headers || {}),
  };

  for (const key in requestHeaders) {
    if (requestHeaders[key] === "undefined") {
      delete requestHeaders[key];
    } else if (
      ["authorization", "Authorization"].includes(key) &&
      requestHeaders[key]?.includes("undefined")
    ) {
      delete requestHeaders[key];
    }
  }

  const response = await sendUnifiedRequest(
    url,
    requestBody,
    {
      httpsProxy: fastify.configService.getHttpsProxy(),
      ...config,
      headers: JSON.parse(JSON.stringify(requestHeaders)),
    },
    context,
    fastify.log
  );

  // Handle request errors
  if (!response.ok) {
    const errorText = await response.text();

    let headers: Record<string, string> | undefined = undefined;
    const retryAfter = response.headers.get("retry-after");

    if (retryAfter) {
      headers = { 'Retry-After': retryAfter };
    } else if (response.status === 429) {
      try {
        const errorJson = JSON.parse(errorText);
        const details = errorJson?.error?.details || errorJson?.details;
        if (Array.isArray(details)) {
          const retryInfo = details.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
          if (retryInfo?.retryDelay) {
            const seconds = parseInt(retryInfo.retryDelay, 10);
            if (!isNaN(seconds)) {
              headers = { 'Retry-After': seconds.toString() };
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    // Log parsed error details for observability
    try {
      const errorJson = JSON.parse(errorText);
      fastify.log.error(
        { error: errorJson, status: response.status, provider: provider.name, model: requestBody.model },
        `[provider_response_error] ${provider.name},${requestBody.model}: ${errorJson?.error?.message || errorText}`,
      );
    } catch {
      fastify.log.error(
        { errorText, status: response.status, provider: provider.name, model: requestBody.model },
        `[provider_response_error] ${provider.name},${requestBody.model}: ${errorText}`,
      );
    }

    throw createApiError(
      `Error from provider(${provider.name},${requestBody.model}: ${response.status}): ${errorText}`,
      response.status,
      "provider_response_error",
      "api_error",
      headers
    );
  }

  return response;
}
```

Key points:
- `doSendRequest` preserves ALL original logic: auth bypass, Retry-After parsing, structured logging, 5-arg `createApiError`
- `sendWithKeyPool` catches thrown errors, checks `error.statusCode` against `RETRYABLE_STATUS_CODES`, marks failed keys
- When all keys exhausted, re-throws with `lastError?.headers` to preserve Retry-After
- The `sendRequestToProvider` signature is unchanged — no caller changes needed

- [ ] **Step 3: Verify build**

Run: `pnpm build:server`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/api/routes.ts
git commit -m "feat: sendRequestToProvider 支持 ApiKeyPool 自动轮询重试"
```

---

### Task 5: Build Verification

- [ ] **Step 1: Full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully.

- [ ] **Step 2: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: 构建验证修复"
```

---

## Verification Checklist

1. Provider with `api_keys: ["key1", "key2", "key3"]` — loads, first key used
2. Provider with single `api_key` — works exactly as before
3. Provider with `api_keys: ["invalid", "valid"]` — auto-switches to key 2 on 401
4. Provider with all-invalid `api_keys` — clear error after all exhausted
5. Server logs show `[key_pool]` messages during rotation
6. Full monorepo build passes
