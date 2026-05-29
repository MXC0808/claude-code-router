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
import { Toast } from "@/components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
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

export const CANCELLED_SIGNAL = Symbol("cancelled");
export type PoolResult<T> = T | typeof CANCELLED_SIGNAL;

export async function promisePool<T>(
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

// ========== Component ==========

export function ApiKeyTesterDialog({
  open,
  onOpenChange,
  config,
  onConfigChange: _onConfigChange,
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

  void api;
  void cancelTest;
  void resetResults;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      resetResults();
      setIsTesting(false);
      cancelRef.current = false;
      setToast(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("apiTester.title")}</DialogTitle>
          </DialogHeader>

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

          <div className="text-xs text-muted-foreground">
            {results.length > 0 ? `${completedCount} / ${results.length}` : ""}
          </div>

          <div>
            <Button onClick={() => {}} disabled>
              {t("apiTester.start_test")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
