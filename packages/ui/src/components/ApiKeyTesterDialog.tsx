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
