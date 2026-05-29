export const DEFAULT_RETRYABLE_STATUS_CODES = new Set([401, 403, 429]);
const DEFAULT_COOLDOWN_SECONDS = 60;
const PERMANENT_FAILURE_CODES = new Set([401, 403]);

export class ApiKeyPool {
  private readonly keys: string[];
  private cursor: number = 0;
  private readonly permanentFailed: Set<number> = new Set();
  private readonly cooldowns: Map<number, number> = new Map();
  private readonly retryableStatusCodes: Set<number>;
  private readonly cooldownSeconds: number;

  constructor(keys: string[], retryableStatusCodes?: number[], keyCooldownSeconds?: number) {
    if (!keys.length) {
      throw new Error("ApiKeyPool requires at least one key");
    }
    this.keys = keys;
    this.retryableStatusCodes = retryableStatusCodes?.length
      ? new Set(retryableStatusCodes)
      : DEFAULT_RETRYABLE_STATUS_CODES;
    this.cooldownSeconds = keyCooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
  }

  getNext(): string {
    const total = this.keys.length;
    const now = Date.now();

    for (let i = 0; i < total; i++) {
      const index = (this.cursor + i) % total;

      if (this.permanentFailed.has(index)) {
        continue;
      }

      const cooldownExpiry = this.cooldowns.get(index);
      if (cooldownExpiry !== undefined && cooldownExpiry > now) {
        continue;
      }

      if (cooldownExpiry !== undefined && cooldownExpiry <= now) {
        this.cooldowns.delete(index);
      }

      this.cursor = (index + 1) % total;
      return this.keys[index];
    }

    throw new Error(
      `All ${total} API keys have been exhausted`
    );
  }

  markFailed(key: string, status: number, retryAfterSeconds?: number): void {
    if (!this.retryableStatusCodes.has(status)) {
      return;
    }

    const index = this.keys.indexOf(key);
    if (index === -1) {
      return;
    }

    if (PERMANENT_FAILURE_CODES.has(status)) {
      this.permanentFailed.add(index);
      this.cooldowns.delete(index);
      return;
    }

    const cooldownMs = Math.max(retryAfterSeconds ?? 0, this.cooldownSeconds) * 1000;
    this.cooldowns.set(index, Date.now() + cooldownMs);
  }

  isRetryable(statusCode: number): boolean {
    return this.retryableStatusCodes.has(statusCode);
  }

  getStatus(): { total: number; available: number; permanentFailed: number; coolingDown: number } {
    const now = Date.now();
    let coolingDown = 0;
    for (const expiry of this.cooldowns.values()) {
      if (expiry > now) {
        coolingDown++;
      }
    }

    return {
      total: this.keys.length,
      available: this.keys.length - this.permanentFailed.size - coolingDown,
      permanentFailed: this.permanentFailed.size,
      coolingDown,
    };
  }
}
