# API Key 快速测试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"快速测试"Dialog，批量测试供应商 API Keys 的可用性和延迟，支持复制和导入。

**Architecture:** 纯前端方案，新增 `ApiKeyTesterDialog.tsx` 组件，复用现有 `/api/providers/test` 端点，前端实现 Promise Pool 并发控制（最多 5 个并发）。后端零改动。

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react, 现有 UI 组件库（Dialog, Button, Badge, Combobox, Tabs, Toast）

**Spec:** `docs/superpowers/specs/2026-05-29-api-key-tester-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/components/ApiKeyTesterDialog.tsx` | 主组件：配置区 + 测试列表 + 结果操作 |
| Modify | `packages/ui/src/App.tsx` | 添加入口按钮和 Dialog 挂载 |
| Modify | `packages/ui/src/locales/zh.json` | 新增 i18n key |
| Modify | `packages/ui/src/locales/en.json` | 新增 i18n key |

---

### Task 1: 添加 i18n 翻译条目

**Files:**
- Modify: `packages/ui/src/locales/zh.json`
- Modify: `packages/ui/src/locales/en.json`

- [ ] **Step 1: 添加中文翻译**

在 `packages/ui/src/locales/zh.json` 的根层级新增 `apiTester` 节：

```json
"apiTester": {
  "title": "快速测试",
  "tab_existing": "已有供应商",
  "tab_manual": "手动输入",
  "base_url": "Base URL",
  "base_url_placeholder": "输入供应商 API Base URL",
  "model": "模型",
  "model_placeholder": "输入模型名称",
  "api_keys": "API Keys",
  "api_keys_placeholder": "每行输入一个 API Key",
  "start_test": "开始测试",
  "testing": "测试中...",
  "cancel": "取消",
  "progress": "{{completed}} / {{total}} 完成",
  "summary": "可用 {{available}} / 共 {{total}}，最低延迟 {{latency}}ms",
  "summary_no_available": "0 个可用 key",
  "copy_available": "复制可用 Keys",
  "append_to_provider": "追加到供应商",
  "replace_provider_keys": "替换供应商 Keys",
  "select_provider": "选择供应商",
  "select_target_provider": "选择目标供应商",
  "select_model": "选择模型",
  "validation_base_url": "请输入 Base URL",
  "validation_keys": "请输入至少一个 API Key",
  "validation_model": "请输入 Model",
  "duplicate_removed": "已移除 {{count}} 个重复 key",
  "copy_success": "已复制到剪贴板",
  "copy_failed": "复制失败",
  "append_success": "已追加 {{count}} 个 key 到供应商 {{name}}",
  "replace_success": "已替换供应商 {{name}} 的 keys",
  "import_no_available": "没有可用的 key 可导入",
  "status_pending": "等待中",
  "status_testing": "测试中",
  "status_success": "成功",
  "status_failed": "失败",
  "status_cancelled": "已取消",
  "error_missing_base_url": "Base URL 为空",
  "error_missing_api_key": "API Key 为空",
  "error_invalid_base_url": "无效的 Base URL",
  "error_auth_failed": "认证失败",
  "error_model_not_found": "模型不存在",
  "error_timeout": "超时",
  "error_network_error": "网络错误",
  "error_unknown": "未知错误"
}
```

- [ ] **Step 2: 添加英文翻译**

在 `packages/ui/src/locales/en.json` 的根层级新增 `apiTester` 节：

```json
"apiTester": {
  "title": "Quick Test",
  "tab_existing": "Existing Provider",
  "tab_manual": "Manual Input",
  "base_url": "Base URL",
  "base_url_placeholder": "Enter provider API Base URL",
  "model": "Model",
  "model_placeholder": "Enter model name",
  "api_keys": "API Keys",
  "api_keys_placeholder": "Enter one API Key per line",
  "start_test": "Start Test",
  "testing": "Testing...",
  "cancel": "Cancel",
  "progress": "{{completed}} / {{total}} completed",
  "summary": "{{available}} available / {{total}} total, lowest latency {{latency}}ms",
  "summary_no_available": "0 available keys",
  "copy_available": "Copy Available Keys",
  "append_to_provider": "Append to Provider",
  "replace_provider_keys": "Replace Provider Keys",
  "select_provider": "Select Provider",
  "select_target_provider": "Select Target Provider",
  "select_model": "Select Model",
  "validation_base_url": "Please enter Base URL",
  "validation_keys": "Please enter at least one API Key",
  "validation_model": "Please enter Model",
  "duplicate_removed": "Removed {{count}} duplicate key(s)",
  "copy_success": "Copied to clipboard",
  "copy_failed": "Copy failed",
  "append_success": "Appended {{count}} key(s) to provider {{name}}",
  "replace_success": "Replaced keys for provider {{name}}",
  "import_no_available": "No available keys to import",
  "status_pending": "Pending",
  "status_testing": "Testing",
  "status_success": "Success",
  "status_failed": "Failed",
  "status_cancelled": "Cancelled",
  "error_missing_base_url": "Base URL is empty",
  "error_missing_api_key": "API Key is empty",
  "error_invalid_base_url": "Invalid Base URL",
  "error_auth_failed": "Authentication failed",
  "error_model_not_found": "Model not found",
  "error_timeout": "Timeout",
  "error_network_error": "Network error",
  "error_unknown": "Unknown error"
}
```

- [ ] **Step 3: 验证 JSON 格式正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/ui/src/locales/zh.json','utf8')); console.log('zh OK')" && node -e "JSON.parse(require('fs').readFileSync('packages/ui/src/locales/en.json','utf8')); console.log('en OK')"`

Expected: `zh OK` 和 `en OK`

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/locales/zh.json packages/ui/src/locales/en.json
git commit -m "feat: 新增快速测试功能 i18n 翻译条目"
```

---

### Task 2: 创建 ApiKeyTesterDialog 组件 — 类型定义与 Promise Pool

**Files:**
- Create: `packages/ui/src/components/ApiKeyTesterDialog.tsx`

- [ ] **Step 1: 创建组件骨架，包含类型和 Promise Pool 工具函数**

创建 `packages/ui/src/components/ApiKeyTesterDialog.tsx`：

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import {
  Zap,
  Copy,
  Plus,
  Replace,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  CircleDot,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Provider, Config } from "@/types";

// ========== Types ==========

type KeyTestStatus = "pending" | "testing" | "success" | "failed" | "cancelled";

interface KeyTestResult {
  key: string;
  status: KeyTestStatus;
  latency?: number;
  error?: string;
}

interface ApiKeyTesterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  onConfigChange: (config: Config) => void;
}

// ========== Helpers ==========

function maskKey(key: string): string {
  if (key.length <= 16) return key.slice(0, 4) + "****" + key.slice(-4);
  return key.slice(0, 8) + "****" + key.slice(-4);
}

function parseKeys(text: string): string[] {
  return text
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function deduplicateKeys(keys: string[]): { unique: string[]; removed: number } {
  const unique = [...new Set(keys)];
  return { unique, removed: keys.length - unique.length };
}

// ========== Promise Pool ==========

async function promisePool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onTaskComplete: (index: number, result: T) => void,
  shouldCancel: () => boolean
): Promise<void> {
  let nextIndex = 0;
  let running = 0;

  return new Promise<void>((resolve) => {
    function runNext() {
      if (shouldCancel()) {
        // Mark remaining tasks as cancelled in order
        while (nextIndex < tasks.length) {
          const idx = nextIndex++;
          // Signal cancelled via the callback
          onTaskComplete(idx, { cancelled: true } as unknown as T);
        }
        if (running === 0) resolve();
        return;
      }

      while (running < concurrency && nextIndex < tasks.length) {
        const index = nextIndex++;
        running++;
        tasks[index]()
          .then((result) => {
            onTaskComplete(index, result);
          })
          .catch((error) => {
            onTaskComplete(index, { error } as unknown as T);
          })
          .finally(() => {
            running--;
            if (nextIndex < tasks.length) {
              runNext();
            } else if (running === 0) {
              resolve();
            }
          });
      }
      if (nextIndex >= tasks.length && running === 0) {
        resolve();
      }
    }
    runNext();
  });
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -20`

Expected: 无报错（允许其他已有文件的 warning，关注新增文件无报错）

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ApiKeyTesterDialog.tsx
git commit -m "feat: 新增 ApiKeyTesterDialog 组件骨架 — 类型和 Promise Pool"
```

---

### Task 3: 实现 Dialog 配置区（已有供应商 / 手动输入 Tab）

**Files:**
- Modify: `packages/ui/src/components/ApiKeyTesterDialog.tsx`

- [ ] **Step 1: 添加配置区组件**

在 `ApiKeyTesterDialog.tsx` 的 `// ========== Helpers ==========` 区域之后，`export` 之前，添加主组件实现：

```tsx
// ========== Component ==========

export function ApiKeyTesterDialog({
  open,
  onOpenChange,
  config,
  onConfigChange,
}: ApiKeyTesterDialogProps) {
  const { t } = useTranslation();

  // --- Input state ---
  const [mode, setMode] = useState<"existing" | "manual">("existing");
  const [selectedProviderIndex, setSelectedProviderIndex] = useState<number | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [keysText, setKeysText] = useState("");
  const [model, setModel] = useState("");

  // --- Test state ---
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<KeyTestResult[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const cancelRef = useRef(false);

  // --- Import state ---
  const [importTargetIndex, setImportTargetIndex] = useState<number | null>(null);

  // --- Toast ---
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const providers = config?.Providers || [];

  const providerOptions = providers.map((p, i) => ({
    value: String(i),
    label: p.name,
  }));

  const modelOptions =
    selectedProviderIndex !== null
      ? (providers[selectedProviderIndex]?.models || []).map((m) => ({
          value: m,
          label: m,
        }))
      : [];

  // Sync fields when selecting an existing provider
  useEffect(() => {
    if (mode !== "existing" || selectedProviderIndex === null) return;
    const provider = providers[selectedProviderIndex];
    if (!provider) return;
    setBaseUrl(provider.api_base_url || "");
    const keys = provider.api_keys?.length
      ? provider.api_keys
      : provider.api_key
        ? [provider.api_key]
        : [];
    setKeysText(keys.join("\n"));
  }, [mode, selectedProviderIndex, providers]);

  // Sync import target default from mode/selection
  useEffect(() => {
    if (mode === "existing" && selectedProviderIndex !== null) {
      setImportTargetIndex(selectedProviderIndex);
    }
  }, [mode, selectedProviderIndex]);

  const isTestingRef = useRef(isTesting);
  isTestingRef.current = isTesting;

  const resetResults = () => {
    setResults([]);
    setCompletedCount(0);
  };
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -20`

Expected: 无新增报错

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ApiKeyTesterDialog.tsx
git commit -m "feat: 实现快速测试 Dialog 配置区逻辑"
```

---

### Task 4: 实现测试逻辑（startTest / cancel）

**Files:**
- Modify: `packages/ui/src/components/ApiKeyTesterDialog.tsx`

- [ ] **Step 1: 添加 startTest 和 cancel 逻辑**

在 `ApiKeyTesterDialog` 组件内部，`resetResults` 函数之后添加：

```tsx
  const cancelTest = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const startTest = useCallback(async () => {
    // Validation
    if (!baseUrl.trim()) {
      setToast({ message: t("apiTester.validation_base_url"), type: "error" });
      return;
    }
    const rawKeys = parseKeys(keysText);
    if (rawKeys.length === 0) {
      setToast({ message: t("apiTester.validation_keys"), type: "error" });
      return;
    }
    if (!model.trim()) {
      setToast({ message: t("apiTester.validation_model"), type: "error" });
      return;
    }

    const { unique, removed } = deduplicateKeys(rawKeys);
    if (removed > 0) {
      setToast({
        message: t("apiTester.duplicate_removed", { count: removed }),
        type: "success",
      });
    }

    const initialResults: KeyTestResult[] = unique.map((key) => ({
      key,
      status: "pending" as const,
    }));

    setResults(initialResults);
    setCompletedCount(0);
    setIsTesting(true);
    cancelRef.current = false;

    const tasks = unique.map((key, _index) => async () => {
      try {
        const response = await api.testProviderModel(baseUrl.trim(), key, model.trim());
        return response;
      } catch (error) {
        return {
          success: false,
          error: { code: "UNKNOWN", message: (error as Error).message },
        };
      }
    });

    const completed: KeyTestResult[] = [...initialResults];

    await promisePool(
      tasks,
      5,
      (index, response) => {
        if (cancelRef.current && completed[index].status === "pending") {
          completed[index] = { ...completed[index], status: "cancelled" };
        } else if ("cancelled" in (response as any)) {
          completed[index] = { ...completed[index], status: "cancelled" };
        } else {
          const res = response as any;
          if (res.success) {
            completed[index] = {
              ...completed[index],
              status: "success",
              latency: res.latency,
            };
          } else {
            completed[index] = {
              ...completed[index],
              status: "failed",
              error: res.error?.code || "UNKNOWN",
            };
          }
        }
        setResults([...completed]);
        setCompletedCount((c) => c + 1);
      },
      () => cancelRef.current
    );

    setIsTesting(false);
  }, [baseUrl, keysText, model, t]);
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -20`

Expected: 无新增报错

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ApiKeyTesterDialog.tsx
git commit -m "feat: 实现批量 API Key 测试与取消逻辑"
```

---

### Task 5: 实现复制和导入逻辑

**Files:**
- Modify: `packages/ui/src/components/ApiKeyTesterDialog.tsx`

- [ ] **Step 1: 添加复制和导入操作函数**

在 `startTest` 函数之后，`// ========== Render` 之前添加：

```tsx
  // --- Derived state ---
  const availableResults = results
    .filter((r) => r.status === "success")
    .sort((a, b) => (a.latency || Infinity) - (b.latency || Infinity));
  const hasAvailable = availableResults.length > 0;
  const isTestComplete = results.length > 0 && !isTesting && results.every((r) => r.status !== "pending" && r.status !== "testing");

  const getErrorDisplay = (errorCode?: string): string => {
    const keyMap: Record<string, string> = {
      MISSING_BASE_URL: "apiTester.error_missing_base_url",
      MISSING_API_KEY: "apiTester.error_missing_api_key",
      INVALID_BASE_URL: "apiTester.error_invalid_base_url",
      AUTH_FAILED: "apiTester.error_auth_failed",
      MODEL_NOT_FOUND: "apiTester.error_model_not_found",
      TIMEOUT: "apiTester.error_timeout",
      NETWORK_ERROR: "apiTester.error_network_error",
    };
    return t(keyMap[errorCode || ""] || "apiTester.error_unknown");
  };

  const handleCopyAvailable = useCallback(async () => {
    const text = availableResults.map((r) => r.key).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: t("apiTester.copy_success"), type: "success" });
    } catch {
      setToast({ message: t("apiTester.copy_failed"), type: "error" });
    }
  }, [availableResults, t]);

  const handleImportKeys = useCallback(
    (action: "append" | "replace") => {
      if (importTargetIndex === null || !hasAvailable) return;
      const targetProvider = providers[importTargetIndex];
      if (!targetProvider) return;

      const newKeys = availableResults.map((r) => r.key);
      const newConfig = { ...config };
      const newProviders = [...newConfig.Providers];
      const target = { ...newProviders[importTargetIndex] };

      if (action === "append") {
        const existingKeys = target.api_keys || [];
        target.api_keys = [...existingKeys, ...newKeys];
      } else {
        target.api_keys = [...newKeys];
      }

      newProviders[importTargetIndex] = target;
      newConfig.Providers = newProviders;
      onConfigChange(newConfig);

      const messageKey = action === "append" ? "apiTester.append_success" : "apiTester.replace_success";
      setToast({
        message: t(messageKey, { count: newKeys.length, name: targetProvider.name }),
        type: "success",
      });
    },
    [importTargetIndex, hasAvailable, availableResults, providers, config, onConfigChange, t]
  );
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -20`

Expected: 无新增报错

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ApiKeyTesterDialog.tsx
git commit -m "feat: 实现一键复制和导入到供应商逻辑"
```

---

### Task 6: 实现 Render（完整 Dialog UI）

**Files:**
- Modify: `packages/ui/src/components/ApiKeyTesterDialog.tsx`

- [ ] **Step 1: 添加完整 render 方法**

替换组件末尾（在 `handleImportKeys` 之后）添加 render：

```tsx
  // ========== Render ==========

  const getStatusIcon = (status: KeyTestStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-gray-400" />;
      case "testing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <Ban className="h-4 w-4 text-gray-400" />;
    }
  };

  // Close handler: only allow close when not testing
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isTesting) return;
    onOpenChange(nextOpen);
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      resetResults();
      setModel("");
      setIsTesting(false);
      cancelRef.current = false;
      setToast(null);
      if (mode === "existing" && selectedProviderIndex !== null) {
        setImportTargetIndex(selectedProviderIndex);
      }
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t("apiTester.title")}
            </DialogTitle>
          </DialogHeader>

          {/* === Configuration Area === */}
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "existing" | "manual")}
          >
            <TabsList>
              <TabsTrigger value="existing">
                {t("apiTester.tab_existing")}
              </TabsTrigger>
              <TabsTrigger value="manual">
                {t("apiTester.tab_manual")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-3 mt-3">
              <div>
                <Label>{t("apiTester.select_provider")}</Label>
                <Combobox
                  options={providerOptions}
                  value={selectedProviderIndex !== null ? String(selectedProviderIndex) : ""}
                  onChange={(val) =>
                    setSelectedProviderIndex(val !== "" ? Number(val) : null)
                  }
                  placeholder={t("apiTester.select_provider")}
                />
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 mt-3">
              <div>
                <Label>{t("apiTester.base_url")}</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={t("apiTester.base_url_placeholder")}
                  disabled={isTesting}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Shared fields */}
          <div className="space-y-3">
            <div>
              <Label>{t("apiTester.model")}</Label>
              {mode === "existing" && modelOptions.length > 0 ? (
                <Combobox
                  options={modelOptions}
                  value={model}
                  onChange={setModel}
                  placeholder={t("apiTester.select_model")}
                  searchPlaceholder={t("apiTester.model_placeholder")}
                />
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("apiTester.model_placeholder")}
                  disabled={isTesting}
                />
              )}
            </div>
            <div>
              <Label>{t("apiTester.api_keys")}</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
                value={keysText}
                onChange={(e) => setKeysText(e.target.value)}
                placeholder={t("apiTester.api_keys_placeholder")}
                disabled={isTesting}
              />
            </div>
          </div>

          {/* === Action Buttons === */}
          <div className="flex items-center gap-2">
            {!isTesting ? (
              <Button onClick={startTest} disabled={results.length > 0 && isTestComplete}>
                <Zap className="mr-2 h-4 w-4" />
                {t("apiTester.start_test")}
              </Button>
            ) : (
              <>
                <Button disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("apiTester.testing")}
                </Button>
                <Button variant="outline" onClick={cancelTest}>
                  {t("apiTester.cancel")}
                </Button>
              </>
            )}
            {isTesting && (
              <span className="text-sm text-muted-foreground">
                {t("apiTester.progress", {
                  completed: completedCount,
                  total: results.length,
                })}
              </span>
            )}
          </div>

          {/* === Results List === */}
          {results.length > 0 && (
            <div className="flex-1 overflow-y-auto border rounded-md">
              {/* Summary bar */}
              {isTestComplete && (
                <div className="sticky top-0 bg-background border-b px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {hasAvailable
                      ? t("apiTester.summary", {
                          available: availableResults.length,
                          total: results.length,
                          latency: availableResults[0]?.latency || 0,
                        })
                      : t("apiTester.summary_no_available")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyAvailable}
                      disabled={!hasAvailable}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {t("apiTester.copy_available")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Key rows */}
              <div className="divide-y">
                {(isTestComplete ? [...availableResults, ...results.filter((r) => r.status !== "success").sort((a, b) => {
                  const order: Record<string, number> = { failed: 0, cancelled: 1, pending: 2, testing: 3, success: 4 };
                  return (order[a.status] ?? 2) - (order[b.status] ?? 2);
                })] : results).map((result, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-2 gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIcon(result.status)}
                      <code className="text-xs truncate font-mono">
                        {maskKey(result.key)}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {result.status === "success" && result.latency !== undefined && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          {result.latency}ms
                        </Badge>
                      )}
                      {result.status === "failed" && result.error && (
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          {getErrorDisplay(result.error)}
                        </Badge>
                      )}
                      {result.status === "cancelled" && (
                        <Badge variant="outline" className="text-gray-400 line-through">
                          {t("apiTester.status_cancelled")}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === Import Area === */}
          {isTestComplete && hasAvailable && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Combobox
                options={providerOptions}
                value={importTargetIndex !== null ? String(importTargetIndex) : ""}
                onChange={(val) =>
                  setImportTargetIndex(val !== "" ? Number(val) : null)
                }
                placeholder={t("apiTester.select_target_provider")}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleImportKeys("append")}
                disabled={importTargetIndex === null}
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("apiTester.append_to_provider")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleImportKeys("replace")}
                disabled={importTargetIndex === null}
              >
                <Replace className="mr-1 h-3 w-3" />
                {t("apiTester.replace_provider_keys")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -30`

Expected: 无新增报错

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ApiKeyTesterDialog.tsx
git commit -m "feat: 实现快速测试 Dialog 完整 UI（配置、测试、结果、导入）"
```

---

### Task 7: 在 App.tsx 集成入口

**Files:**
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: 添加导入和状态**

在 `packages/ui/src/App.tsx` 的 import 区域添加：

```tsx
import { ApiKeyTesterDialog } from "@/components/ApiKeyTesterDialog";
import { Zap } from "lucide-react";
```

注意：`lucide-react` 已有其他图标导入，在现有 import 语句中追加 `Zap`。

- [ ] **Step 2: 添加 state 和 config 桥接**

在 `App` 组件内，现有 state 声明之后添加：

```tsx
const [isApiKeyTesterOpen, setIsApiKeyTesterOpen] = useState(false);

const handleConfigChange = useCallback(
  async (newConfig: Config) => {
    try {
      await api.updateConfig(newConfig);
      setToast({ message: t("app.config_saved_success"), type: "success" });
    } catch (err) {
      console.error("Failed to save config:", err);
      setToast({ message: t("app.config_saved_failed"), type: "error" });
    }
  },
  [t]
);
```

- [ ] **Step 3: 添加入口按钮**

在 `App.tsx` 的 `<header>` 区域，`<Popover>`（语言切换）之前添加：

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setIsApiKeyTesterOpen(true)}
      className="transition-all-ease hover:scale-110"
    >
      <Zap className="h-5 w-5" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>{t("apiTester.title")}</p>
  </TooltipContent>
</Tooltip>
```

- [ ] **Step 4: 挂载 Dialog**

在 `App.tsx` 的 `<SettingsDialog />` 之前添加：

```tsx
<ApiKeyTesterDialog
  open={isApiKeyTesterOpen}
  onOpenChange={setIsApiKeyTesterOpen}
  config={config}
  onConfigChange={handleConfigChange}
/>
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd packages/ui && npx tsc --noEmit 2>&1 | head -30`

Expected: 无新增报错

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat: 在 App 顶部工具栏集成快速测试入口"
```

---

### Task 8: 端到端手动验证

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm dev:ui`

Expected: Vite dev server 启动成功

- [ ] **Step 2: 打开浏览器验证 UI**

1. 打开 `http://localhost:5173`（或 Vite 输出的端口）
2. 点击顶部工具栏的 ⚡ 图标
3. Dialog 应正确打开，显示两个 Tab
4. 选择一个已有供应商 → Base URL 和 Keys 应自动填入
5. 切换到手动输入 → Base URL 输入框可编辑

- [ ] **Step 3: 验证输入校验**

1. 不填任何字段，点击"开始测试" → 应提示"请输入 Base URL"
2. 填入 Base URL，不填 Keys，点击"开始测试" → 应提示"请输入至少一个 API Key"
3. 填入 Base URL 和 Keys，不填 Model，点击"开始测试" → 应提示"请输入 Model"

- [ ] **Step 4: 验证测试流程**

1. 填入有效的 Base URL、一个或多个 API Key、一个有效的 Model
2. 点击"开始测试" → 进度条应实时更新，key 状态应逐个变化
3. 测试完成后 → 可用 key 应排在最前，显示延迟
4. 点击"复制可用 Keys" → 剪贴板内容应为可用 keys（换行分隔）

- [ ] **Step 5: 验证导入功能**

1. 选择目标供应商，点击"追加到供应商"
2. 检查该供应商的 api_keys 是否已追加新 key
3. 点击"替换供应商 Keys"
4. 检查该供应商的 api_keys 是否已被替换

- [ ] **Step 6: 验证取消功能**

1. 使用多个 key 开始测试
2. 测试进行中点击"取消"
3. pending 的 key 应标记为 `cancelled`，正在测试的 key 应等待完成后显示结果
