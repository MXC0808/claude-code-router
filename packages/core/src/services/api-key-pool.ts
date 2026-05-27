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
