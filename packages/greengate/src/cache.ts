export interface CacheHit<T> {
  value: T;
  fresh: boolean;
  ageMs: number;
}

/**
 * Fresh for `ttlMs` (default 15 minutes). After that the value stays readable
 * as stale until `staleMs` (default 6 hours), then it is dropped.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; storedAt: number }>();

  constructor(
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly staleMs = 6 * 60 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): CacheHit<T> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const ageMs = this.now() - entry.storedAt;
    if (ageMs > this.staleMs) {
      this.entries.delete(key);
      return null;
    }
    return { value: entry.value, fresh: ageMs <= this.ttlMs, ageMs };
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, storedAt: this.now() });
  }
}
