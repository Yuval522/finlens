/**
 * Minimal in-memory TTL cache used to shield the market-data provider from
 * repeated requests (and its rate limits) within a short window.
 *
 * Scoped to this process's memory — fine for local dev and single-instance
 * deployments. For multi-instance production, swap the two methods below
 * for a Redis client (e.g. `redis.get`/`redis.set(key, value, { EX: ttl })`)
 * behind the same `get`/`set` shape; nothing else in lib/finance needs to
 * change.
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Fetch-through helper: returns the cached value, or calls `fn`, caches, and returns it. */
  async getOrSet(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    this.set(key, value);
    return value;
  }
}
