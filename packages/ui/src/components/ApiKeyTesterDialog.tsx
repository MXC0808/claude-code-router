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
} from "lucide-react";
import { api } from "@/lib/api";
import type { TestProviderResponse } from "@/lib/api";
import type { Config } from "@/types";

// ========== Types ==========

export type KeyTestStatus = "pending" | "testing" | "success" | "failed" | "cancelled";

export interface KeyTestResult {
  key: string;
  status: KeyTestStatus;
  latency?: number;
  error?: string;
}

export interface ApiKeyTesterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  onConfigChange: (config: Config) => void;
}

// ========== Helpers ==========

export function maskKey(key: string): string {
  if (key.length <= 16) return key.slice(0, 4) + "****" + key.slice(-4);
  return key.slice(0, 8) + "****" + key.slice(-4);
}

export function parseKeys(text: string): string[] {
  return text
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function deduplicateKeys(keys: string[]): { unique: string[]; removed: number } {
  const unique = [...new Set(keys)];
  return { unique, removed: keys.length - unique.length };
}

// ========== Promise Pool ==========

const CANCELLED_SIGNAL = Symbol("cancelled");
type PoolResult<T> = T | typeof CANCELLED_SIGNAL;

async function promisePool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onTaskComplete: (index: number, result: PoolResult<T>) => void,
  shouldCancel: () => boolean
): Promise<void> {
  let nextIndex = 0;
  let running = 0;

  return new Promise<void>((resolve) => {
    function runNext() {
      if (shouldCancel()) {
        while (nextIndex < tasks.length) {
          const idx = nextIndex++;
          onTaskComplete(idx, CANCELLED_SIGNAL);
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
          .catch(() => {
            // Errors converted to failed result by callers
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

const TEST_CONCURRENCY = 5;

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

  const resetResults = () => {
    setResults([]);
    setCompletedCount(0);
  };

  const cancelTest = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const startTest = useCallback(async () => {
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

    const tasks = unique.map((key) => async (): Promise<TestProviderResponse> => {
      try {
        return await api.testProviderModel(baseUrl.trim(), key, model.trim());
      } catch (error) {
        return {
          success: false,
          error: { code: "UNKNOWN", message: (error as Error).message },
        };
      }
    });

    const completed: KeyTestResult[] = [...initialResults];

    // Mark each task as testing right when its turn comes — done lazily
    // by wrapping each task to set status before awaiting
    const wrappedTasks = tasks.map((task, index) => async () => {
      completed[index] = { ...completed[index], status: "testing" };
      setResults([...completed]);
      return task();
    });

    await promisePool<TestProviderResponse>(
      wrappedTasks,
      TEST_CONCURRENCY,
      (index, response) => {
        if (response === CANCELLED_SIGNAL) {
          completed[index] = { ...completed[index], status: "cancelled" };
        } else if (response.success) {
          completed[index] = {
            ...completed[index],
            status: "success",
            latency: response.latency,
          };
        } else {
          completed[index] = {
            ...completed[index],
            status: "failed",
            error: response.error?.code || "UNKNOWN",
          };
        }
        setResults([...completed]);
        setCompletedCount((c) => c + 1);
      },
      () => cancelRef.current
    );

    setIsTesting(false);
  }, [baseUrl, keysText, model, t]);

  // --- Derived state ---
  const availableResults = results
    .filter((r) => r.status === "success")
    .sort((a, b) => (a.latency || Infinity) - (b.latency || Infinity));
  const hasAvailable = availableResults.length > 0;
  const isTestComplete =
    results.length > 0 &&
    !isTesting &&
    results.every((r) => r.status !== "pending" && r.status !== "testing");

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

      const messageKey =
        action === "append" ? "apiTester.append_success" : "apiTester.replace_success";
      setToast({
        message: t(messageKey, { count: newKeys.length, name: targetProvider.name }),
        type: "success",
      });
    },
    [importTargetIndex, hasAvailable, availableResults, providers, config, onConfigChange, t]
  );

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

  // Only allow close when not testing
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sortedResults = isTestComplete
    ? [
        ...availableResults,
        ...results
          .filter((r) => r.status !== "success")
          .sort((a, b) => {
            const order: Record<string, number> = {
              failed: 0,
              cancelled: 1,
              pending: 2,
              testing: 3,
              success: 4,
            };
            return (order[a.status] ?? 2) - (order[b.status] ?? 2);
          }),
      ]
    : results;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-3">
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
              <TabsTrigger value="existing">{t("apiTester.tab_existing")}</TabsTrigger>
              <TabsTrigger value="manual">{t("apiTester.tab_manual")}</TabsTrigger>
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
              <Button onClick={startTest}>
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
              {isTestComplete && (
                <div className="sticky top-0 bg-background border-b px-4 py-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {hasAvailable
                      ? t("apiTester.summary", {
                          available: availableResults.length,
                          total: results.length,
                          latency: availableResults[0]?.latency || 0,
                        })
                      : t("apiTester.summary_no_available")}
                  </span>
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
              )}

              <div className="divide-y">
                {sortedResults.map((result, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-2 gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIcon(result.status)}
                      <code
                        className={`text-xs truncate font-mono ${
                          result.status === "cancelled" ? "line-through text-gray-400" : ""
                        }`}
                      >
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
                        <Badge variant="outline" className="text-gray-400">
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
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
