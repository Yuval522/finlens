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

  /**
   * `maxSize` is optional (default: unbounded, the original behavior — no
   * existing call site passes a second argument, so this is purely
   * additive). Added for lib/strategy/query-cache.ts, whose keys are
   * derived from arbitrary free-text user queries rather than a small,
   * bounded set of symbols — without a cap, a long-lived warm serverless
   * instance fielding many distinct queries would grow this map forever.
   * Eviction is plain FIFO by insertion order (a `Map` already iterates in
   * insertion order in JS), not LRU — simpler, and good enough for a
   * cache whose main goal is catching exact-repeat queries within a
   * session/short window rather than perfectly maximizing hit rate.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly maxSize?: number
  ) {}

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
    if (this.maxSize != null && !this.store.has(key) && this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
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
