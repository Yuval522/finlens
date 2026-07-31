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

  /**
   * Explicit eviction — used by the earnings-aware cache bypass in
   * yahoo.ts, which re-keys `fundamentalsCache` by a freshness epoch that
   * changes the moment a symbol crosses a new earnings date. Without this,
   * the previous epoch's entry would just sit in `store` until its own TTL
   * happened to be checked again (which may never happen once nothing
   * requests that exact key anymore) — a slow, unbounded memory leak for a
   * long-running process. Deleting the stale key explicitly the moment we
   * know it's superseded keeps the cache's real footprint bounded to
   * "currently relevant keys" regardless of how many earnings cycles a
   * long-lived server process lives through.
   */
  delete(key: string): void {
    this.store.delete(key);
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
