# Provider Test Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a test button to each provider row in the UI that sends a minimal chat completion request to verify model accessibility.

**Architecture:** Backend adds `POST /api/providers/test` reusing existing SSRF/env-var helpers from `/api/providers/models`. Frontend adds test button per row, test dialog with model selector, and inline result display.

**Tech Stack:** Fastify (backend), React + i18next (frontend), native `fetch`.

---

## File Map

| File | Task | Change Type |
|------|------|-------------|
| `packages/server/src/server.ts` | Task 1 | Modify — add test endpoint (~45 lines) |
| `packages/ui/src/lib/api.ts` | Task 2 | Modify — add `testProviderModel()` method |
| `packages/ui/src/locales/en.json` | Task 3 | Modify — add i18n keys |
| `packages/ui/src/locales/zh.json` | Task 3 | Modify — add i18n keys |
| `packages/ui/src/components/ProviderList.tsx` | Task 4 | Modify — add test button + `onTest` prop |
| `packages/ui/src/components/Providers.tsx` | Task 5 | Modify — add test dialog + state |

---

## Task 1: Backend — POST /api/providers/test

**Files:**
- Modify: `packages/server/src/server.ts` (insert after the existing `/api/providers/models` endpoint, line ~739)

- [ ] **Step 1: Add test error constants (after `FETCH_MODELS_ERRORS`, line ~40)**

Add a new error map for the test endpoint, reusing the same pattern as `FETCH_MODELS_ERRORS`:

```typescript
const PROVIDER_TEST_ERRORS = {
  MISSING_BASE_URL: { code: 'MISSING_BASE_URL' as const, message: 'API Base URL is required' },
  MISSING_API_KEY: { code: 'MISSING_API_KEY' as const, message: 'API Key is required' },
  MISSING_MODEL: { code: 'MISSING_MODEL' as const, message: 'Model is required' },
  INVALID_BASE_URL: { code: 'INVALID_BASE_URL' as const, message: 'Invalid base URL. Please check the address.' },
  AUTH_FAILED: { code: 'AUTH_FAILED' as const, message: 'Authentication failed. Please check your API Key.' },
  MODEL_NOT_FOUND: { code: 'MODEL_NOT_FOUND' as const, message: 'Model not found or unavailable.' },
  TIMEOUT: { code: 'TIMEOUT' as const, message: 'Request timeout. The model may be too slow to respond.' },
  NETWORK_ERROR: { code: 'NETWORK_ERROR' as const, message: 'Network error. Please check your connection.' },
  UNKNOWN: { code: 'UNKNOWN' as const, message: 'Test failed.' },
} as const;
```

- [ ] **Step 2: Add test timeout constant (after `FETCH_MODELS_TIMEOUT_MS`, line ~29)**

```typescript
const PROVIDER_TEST_TIMEOUT_MS = 30000;
```

- [ ] **Step 3: Add the `/api/providers/test` endpoint (after `/api/providers/models` endpoint, after line ~739)**

Insert this complete handler. It reuses `validateBaseUrl`, `isGeminiUrl`, and `appendApiKeyToUrl` already defined in the file.

```typescript
// Test provider model connectivity
app.post('/api/providers/test', async (req: any, reply: any) => {
  const { baseUrl, apiKey, model } = req.body || {};

  if (!baseUrl?.trim()) {
    return { success: false, error: { ...PROVIDER_TEST_ERRORS.MISSING_BASE_URL } };
  }

  const validation = validateBaseUrl(baseUrl);
  if (!validation.valid) {
    req.log.warn(`SSRF check failed for test: ${String(baseUrl).substring(0, 60)}, reason: ${validation.error}`);
    return { success: false, error: { ...PROVIDER_TEST_ERRORS.INVALID_BASE_URL } };
  }

  if (!apiKey?.trim()) {
    return { success: false, error: { ...PROVIDER_TEST_ERRORS.MISSING_API_KEY } };
  }

  if (!model?.trim()) {
    return { success: false, error: { ...PROVIDER_TEST_ERRORS.MISSING_MODEL } };
  }

  // Resolve environment variable placeholders in apiKey
  const resolvedApiKey = apiKey.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match: string, braced: string, unbraced: string) => {
    const varName = braced || unbraced;
    return process.env[varName] || match;
  });

  const isGemini = isGeminiUrl(baseUrl);

  // Build the chat completions URL
  let fetchUrl: string;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (isGemini) {
    // Gemini uses generateContent endpoint
    const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
    fetchUrl = appendApiKeyToUrl(`${trimmedBase}/models/${encodeURIComponent(model)}:generateContent`, resolvedApiKey);
  } else {
    // OpenAI-compatible providers
    const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
    let chatUrl = trimmedBase;
    if (!chatUrl.endsWith('/chat/completions')) {
      chatUrl = `${chatUrl}/chat/completions`;
    }
    fetchUrl = chatUrl;
    headers['Authorization'] = `Bearer ${resolvedApiKey}`;
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);

    const body = isGemini
      ? JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } })
      : JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 });

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return { success: true, latency };
    }

    const responseBody = await response.text().catch(() => '').then((t: string) => t.slice(0, 500));

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: { ...PROVIDER_TEST_ERRORS.AUTH_FAILED } };
    }

    if (response.status === 404) {
      return { success: false, error: { ...PROVIDER_TEST_ERRORS.MODEL_NOT_FOUND } };
    }

    return {
      success: false,
      error: { code: 'UNKNOWN' as const, message: `HTTP ${response.status}: ${responseBody}`.slice(0, 200) },
    };

  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: { ...PROVIDER_TEST_ERRORS.TIMEOUT } };
    }
    return {
      success: false,
      error: { code: 'NETWORK_ERROR' as const, message: String(err.message || err).slice(0, 200) },
    };
  }
});
```

- [ ] **Step 4: Verify server starts**

Run:
```bash
cd packages/server && npx ts-node --esm src/index.ts &
sleep 3
curl -s http://localhost:3456/health
# Expected: health response, no startup errors
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat: add provider model test endpoint"
```

---

## Task 2: Frontend — api.ts testProviderModel

**Files:**
- Modify: `packages/ui/src/lib/api.ts`

- [ ] **Step 1: Add test result types and method to ApiClient**

Insert after the `fetchProviderModels` method (after line ~366, before the closing `}` of the class):

```typescript
// Test a provider model connection
async testProviderModel(baseUrl: string, apiKey: string, model: string): Promise<TestProviderResponse> {
  return this.post<TestProviderResponse>('/providers/test', {
    baseUrl,
    apiKey,
    model,
  });
}
```

- [ ] **Step 2: Add TestProviderResponse interface**

Insert at the top of the file, after the existing `FetchModelsAPIError` class (after line ~45):

```typescript
// Types for provider test feature
export interface TestProviderResponse {
  success: boolean;
  latency?: number;
  error?: { code: string; message: string };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/api.ts
git commit -m "feat: add testProviderModel API method"
```

---

## Task 3: Frontend — i18n keys

**Files:**
- Modify: `packages/ui/src/locales/en.json`
- Modify: `packages/ui/src/locales/zh.json`

- [ ] **Step 1: Add keys to en.json**

In the `"providers"` section, add these keys (after `"fetch_models_pre_check_key"`, line ~121):

```json
"test_model": "Test Model",
"select_model_to_test": "Select a model to test",
"test_successful": "Test successful! Latency: {{latency}}ms",
"test_failed": "Test failed",
"test_failed_model_not_found": "Model not found or unavailable",
"test_failed_auth": "Authentication failed. Please check your API Key.",
"test_failed_timeout": "Request timeout. The model may be too slow to respond.",
"test_failed_network": "Network error. Please check your connection.",
"test_failed_unknown": "Test failed. Please try again.",
"no_models_available": "No models configured. Please add models first."
```

- [ ] **Step 2: Add keys to zh.json**

In the `"providers"` section, add these keys (after `"fetch_models_pre_check_key"`, line ~121):

```json
"test_model": "测试模型",
"select_model_to_test": "选择要测试的模型",
"test_successful": "测试成功！延迟：{{latency}}ms",
"test_failed": "测试失败",
"test_failed_model_not_found": "模型不存在或不可用",
"test_failed_auth": "认证失败，请检查 API Key",
"test_failed_timeout": "请求超时，模型可能响应太慢",
"test_failed_network": "网络错误，请检查网络连接",
"test_failed_unknown": "测试失败，请重试",
"no_models_available": "没有配置模型，请先添加模型"
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/locales/en.json packages/ui/src/locales/zh.json
git commit -m "feat: add i18n keys for provider test feature"
```

---

## Task 4: Frontend — ProviderList.tsx test button

**Files:**
- Modify: `packages/ui/src/components/ProviderList.tsx`

- [ ] **Step 1: Update imports**

Add `Wifi` to the lucide-react import:

```tsx
import { Wifi, Pencil, Trash2 } from "lucide-react";
```

- [ ] **Step 2: Add `onTest` to ProviderListProps interface**

```tsx
interface ProviderListProps {
  providers: Provider[];
  onEdit: (index: number) => void;
  onTest: (index: number) => void;
  onRemove: (index: number) => void;
}
```

- [ ] **Step 3: Update function signature**

```tsx
export function ProviderList({ providers, onEdit, onTest, onRemove }: ProviderListProps) {
```

- [ ] **Step 4: Add test button in the invalid provider case (line ~36, before the edit button)**

```tsx
<Button variant="ghost" size="icon" onClick={() => onTest(index)} className="transition-all-ease hover:scale-110" disabled>
  <Wifi className="h-4 w-4" />
</Button>
```

- [ ] **Step 5: Add test button in the normal provider case (line ~71, before the edit button)**

```tsx
<Button variant="ghost" size="icon" onClick={() => onTest(index)} className="transition-all-ease hover:scale-110">
  <Wifi className="h-4 w-4" />
</Button>
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/ProviderList.tsx
git commit -m "feat: add test button to provider list rows"
```

---

## Task 5: Frontend — Providers.tsx test dialog

**Files:**
- Modify: `packages/ui/src/components/Providers.tsx`

- [ ] **Step 1: Add `Wifi` to imports (line ~17)**

Update the existing lucide-react import to include `Wifi`:

```tsx
import { X, Trash2, Plus, Eye, EyeOff, Search, XCircle, Wifi } from "lucide-react";
```

- [ ] **Step 2: Add `TestProviderResponse` to api import (line ~22)**

```tsx
import { api } from "@/lib/api";
import type { TestProviderResponse } from "@/lib/api";
```

- [ ] **Step 3: Add test dialog state (after `localToast` state, line ~42)**

```tsx
const [testingProviderIndex, setTestingProviderIndex] = useState<number | null>(null);
const [testingModel, setTestingModel] = useState<string>("");
const [isTesting, setIsTesting] = useState(false);
const [testResult, setTestResult] = useState<TestProviderResponse | null>(null);
```

- [ ] **Step 4: Add test handlers (after `handleRemoveProvider`, line ~208)**

```tsx
const handleTestProvider = (filteredIndex: number) => {
  const actualIndex = validProviders.indexOf(filteredProviders[filteredIndex]);
  const provider = config.Providers[actualIndex];
  if (!provider) return;

  // Guard: require API URL and API key before testing
  if (!provider.api_base_url?.trim()) {
    setLocalToast({ message: t("providers.fetch_models_pre_check_url"), type: 'warning' });
    return;
  }
  if (!provider.api_key?.trim()) {
    setLocalToast({ message: t("providers.fetch_models_pre_check_key"), type: 'warning' });
    return;
  }
  // Guard: require at least one model
  if (!Array.isArray(provider.models) || provider.models.length === 0) {
    setLocalToast({ message: t("providers.no_models_available"), type: 'warning' });
    return;
  }

  setTestingProviderIndex(actualIndex);
  setTestingModel("");
  setTestResult(null);
  setIsTesting(false);
};

const handleRunTest = async () => {
  if (testingProviderIndex === null || !testingModel) return;

  const provider = config.Providers[testingProviderIndex];
  if (!provider) return;

  setIsTesting(true);
  setTestResult(null);

  try {
    const result = await api.testProviderModel(
      provider.api_base_url,
      provider.api_key,
      testingModel
    );
    setTestResult(result);
  } catch (err: any) {
    setTestResult({
      success: false,
      error: { code: 'UNKNOWN', message: String(err.message || err) },
    });
  } finally {
    setIsTesting(false);
  }
};

const handleCloseTestDialog = () => {
  setTestingProviderIndex(null);
  setTestingModel("");
  setTestResult(null);
  setIsTesting(false);
};
```

- [ ] **Step 5: Wire `onTest` prop to ProviderList (line ~546)**

```tsx
<ProviderList
  providers={filteredProviders}
  onEdit={handleEditProvider}
  onTest={handleTestProvider}
  onRemove={handleSetDeletingProviderIndex}
/>
```

- [ ] **Step 6: Add test dialog JSX (before the Delete Confirmation Dialog, line ~1034)**

Insert after the Edit Dialog closing `</Dialog>` (line ~1032) and before the Delete Confirmation Dialog:

```tsx
{/* Test Dialog */}
<Dialog open={testingProviderIndex !== null} onOpenChange={(open) => {
  if (!open) handleCloseTestDialog();
}}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{t("providers.test_connectivity")}</DialogTitle>
    </DialogHeader>
    {testingProviderIndex !== null && (
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>{t("providers.select_model_to_test")}</Label>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={testingModel}
            onChange={(e) => {
              setTestingModel(e.target.value);
              setTestResult(null);
            }}
          >
            <option value="">{t("providers.select_model_to_test")}</option>
            {(config.Providers[testingProviderIndex]?.models || []).map((model: string) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        {testResult && (
          <div className={`rounded-md p-3 text-sm ${
            testResult.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {testResult.success
              ? t("providers.test_successful", { latency: testResult.latency })
              : (() => {
                  const errorKeyMap: Record<string, string> = {
                    'AUTH_FAILED': 'test_failed_auth',
                    'MODEL_NOT_FOUND': 'test_failed_model_not_found',
                    'TIMEOUT': 'test_failed_timeout',
                    'NETWORK_ERROR': 'test_failed_network',
                    'UNKNOWN': 'test_failed_unknown',
                  };
                  const i18nKey = errorKeyMap[testResult.error?.code || ''] || 'test_failed_unknown';
                  return t(`providers.${i18nKey}`);
                })()
            }
          </div>
        )}
      </div>
    )}
    <DialogFooter>
      <Button variant="outline" onClick={handleCloseTestDialog}>{t("app.cancel")}</Button>
      <Button
        onClick={handleRunTest}
        disabled={!testingModel || isTesting}
      >
        <Wifi className="mr-2 h-4 w-4" />
        {isTesting ? t("providers.testing") : t("providers.test_model")}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 7: Remove commented-out test button code (line ~1019-1027)**

Delete the old commented-out test button from the edit dialog footer:

```tsx
{/* <Button 
  variant="outline" 
  onClick={() => editingProvider && testConnectivity(editingProvider)}
  disabled={isTestingConnectivity || !editingProvider}
>
  <Wifi className="mr-2 h-4 w-4" />
  {isTestingConnectivity ? t("providers.testing") : t("providers.test_connectivity")}
</Button> */}
```

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/Providers.tsx
git commit -m "feat: add provider test dialog with model selection"
```

---

## Task 6: Build and verify

- [ ] **Step 1: Build all packages**

```bash
cd /Users/maoxiaochuang/IdeaProjects/claude-code-router
pnpm build
```
Expected: No errors.

- [ ] **Step 2: Launch via Docker Compose**

```bash
cd packages/server
docker compose up --build -d
```

- [ ] **Step 3: Verify in browser**

1. Open the UI (`ccr ui` or direct URL)
2. Verify test button (Wifi icon) appears before edit button in each provider row
3. Click test button on a provider
4. Select a model from the dropdown
5. Click "Test Model" button
6. Verify: success shows green message with latency, failure shows red message with error reason

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete provider test button feature"
```
