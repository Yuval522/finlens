import { getDb, ensureSchema } from "@/lib/db/client";
import { getStrategyQuotes, type StrategyQuote } from "@/lib/finance/yahoo";
import { STRATEGY_UNIVERSE_SYMBOLS } from "@/lib/finance/symbols";
import { computeTechnicalValuesBatchedWithProgress, type TechnicalValues } from "./technical";

/**
 * Background refresh for the strategy_universe_metrics table (see
 * lib/db/client.ts's schema comment) — this is what lets
 * lib/strategy/execute.ts serve screening queries from precomputed data
 * instead of live Yahoo Finance calls on every request. Invoked by
 * app/api/cron/refresh-strategy-universe/route.ts on a schedule; also
 * safe to call directly for local testing/backfill.
 *
 * Design constraints this works around:
 *
 * 1. Vercel Cron on the Hobby plan can only fire once a day (a cron
 *    expression firing more often fails at DEPLOY time, not silently) —
 *    see vercel.json's comment. A single daily run has to be resilient to
 *    not fully completing within one invocation's time budget.
 * 2. A serverless function has a hard wall-clock time limit (maxDuration —
 *    see the cron route). 400+ symbols x a real Yahoo chart() fetch each
 *    (batched, see technical.ts) can plausibly take longer than that limit
 *    in a slow-network run — the priority-by-staleness ordering below is
 *    what makes that OK: a single run doesn't need to finish the whole
 *    universe, it just needs to make forward progress on the stalest rows.
 *
 * So this is deliberately built to degrade gracefully rather than assume
 * one run always finishes the whole universe:
 *  - Quotes are refreshed for ALL symbols first, always, in one cheap
 *    batched call — this alone keeps price/marketCap/P/E/dividend
 *    yield/volume filters fresh even if technical (RSI/SMA) refresh runs
 *    out of time.
 *  - Technical (RSI/SMA) lookups are processed in PRIORITY order: symbols
 *    with no row yet, then symbols with the OLDEST updated_at, so a run
 *    that gets cut short always makes progress on whatever is most stale
 *    rather than perpetually re-refreshing the same symbols at the start
 *    of STRATEGY_UNIVERSE_SYMBOLS and starving the ones at the end.
 *  - Each batch is upserted to Postgres immediately as it completes
 *    (progressive persistence), not collected in memory and written once
 *    at the end — so a run that gets killed by the platform mid-way still
 *    keeps everything it managed to compute, rather than losing all of
 *    it.
 */

export interface UniverseMetricsRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  peRatio: number | null;
  dividendYieldPercent: number | null;
  volume: number | null;
  rsi14: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
  updatedAt: number;
}

interface DbRow {
  symbol: string;
  name: string;
  price: string | number | null;
  change_percent: string | number | null;
  market_cap: string | number | null;
  pe_ratio: string | number | null;
  dividend_yield_percent: string | number | null;
  volume: string | number | null;
  rsi14: string | number | null;
  price_vs_sma50: string | number | null;
  price_vs_sma200: string | number | null;
  updated_at: string | number;
}

/** Postgres's node driver returns DOUBLE PRECISION/BIGINT columns as strings in some configurations (to avoid silent float/bigint precision loss) — normalize defensively either way rather than assuming a single wire shape. */
function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fromDbRow(row: DbRow): UniverseMetricsRow {
  return {
    symbol: row.symbol,
    name: row.name,
    price: toNum(row.price),
    changePercent: toNum(row.change_percent),
    marketCap: toNum(row.market_cap),
    peRatio: toNum(row.pe_ratio),
    dividendYieldPercent: toNum(row.dividend_yield_percent),
    volume: toNum(row.volume),
    rsi14: toNum(row.rsi14),
    priceVsSma50: toNum(row.price_vs_sma50),
    priceVsSma200: toNum(row.price_vs_sma200),
    updatedAt: Number(row.updated_at),
  };
}

/** Reads precomputed rows for the given symbols. Missing symbols simply have no entry in the returned map — see execute.ts for how it treats that as "needs a live fetch". */
export async function getUniverseMetricsFromDb(symbols: string[]): Promise<Map<string, UniverseMetricsRow>> {
  if (symbols.length === 0) return new Map();
  await ensureSchema();
  const db = getDb();
  const result = await db.execute<DbRow>({
    sql: `SELECT symbol, name, price, change_percent, market_cap, pe_ratio, dividend_yield_percent, volume, rsi14, price_vs_sma50, price_vs_sma200, updated_at
          FROM strategy_universe_metrics WHERE symbol = ANY(?)`,
    args: [symbols],
  });
  const map = new Map<string, UniverseMetricsRow>();
  for (const row of result.rows) map.set(row.symbol, fromDbRow(row));
  return map;
}

const UPSERT_BATCH_SIZE = 30; // 30 rows x 12 params/row = 360 placeholders per statement, comfortably under Postgres's 65535-param limit while keeping round-trips low.

async function upsertUniverseMetricsBatch(rows: UniverseMetricsRow[]): Promise<void> {
  if (rows.length === 0) return;
  await ensureSchema();
  const db = getDb();
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const rowPlaceholder = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const sql = `INSERT INTO strategy_universe_metrics
        (symbol, name, price, change_percent, market_cap, pe_ratio, dividend_yield_percent, volume, rsi14, price_vs_sma50, price_vs_sma200, updated_at)
      VALUES ${batch.map(() => rowPlaceholder).join(", ")}
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        change_percent = EXCLUDED.change_percent,
        market_cap = EXCLUDED.market_cap,
        pe_ratio = EXCLUDED.pe_ratio,
        dividend_yield_percent = EXCLUDED.dividend_yield_percent,
        volume = EXCLUDED.volume,
        rsi14 = EXCLUDED.rsi14,
        price_vs_sma50 = EXCLUDED.price_vs_sma50,
        price_vs_sma200 = EXCLUDED.price_vs_sma200,
        updated_at = EXCLUDED.updated_at`;
    const args = batch.flatMap((r) => [
      r.symbol,
      r.name,
      r.price,
      r.changePercent,
      r.marketCap,
      r.peRatio,
      r.dividendYieldPercent,
      r.volume,
      r.rsi14,
      r.priceVsSma50,
      r.priceVsSma200,
      r.updatedAt,
    ]);
    await db.execute({ sql, args });
  }
}

/** Only touches quote-derived fields (never rsi14/priceVsSma50/priceVsSma200) — used for the quotes-only pass that always runs first, before priority ordering for the (potentially time-limited) technical pass is even computed. Upserting a NULL technical field here would incorrectly wipe out a previously-computed value for a symbol this run never gets to. */
async function upsertQuoteOnlyBatch(quotes: StrategyQuote[], now: number): Promise<void> {
  if (quotes.length === 0) return;
  await ensureSchema();
  const db = getDb();
  for (let i = 0; i < quotes.length; i += UPSERT_BATCH_SIZE) {
    const batch = quotes.slice(i, i + UPSERT_BATCH_SIZE);
    const rowPlaceholder = "(?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const sql = `INSERT INTO strategy_universe_metrics
        (symbol, name, price, change_percent, market_cap, pe_ratio, dividend_yield_percent, volume, updated_at)
      VALUES ${batch.map(() => rowPlaceholder).join(", ")}
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        change_percent = EXCLUDED.change_percent,
        market_cap = EXCLUDED.market_cap,
        pe_ratio = EXCLUDED.pe_ratio,
        dividend_yield_percent = EXCLUDED.dividend_yield_percent,
        volume = EXCLUDED.volume,
        updated_at = EXCLUDED.updated_at`;
    const args = batch.flatMap((q) => [
      q.symbol,
      q.name || q.symbol,
      q.price,
      q.changePercent,
      q.marketCap,
      q.peRatio,
      q.dividendYieldPercent,
      q.volume,
      now,
    ]);
    await db.execute({ sql, args });
  }
}

/** Pure sort: never-refreshed symbols (no row at all) first, then oldest updated_at first — see this module's doc comment for why this ordering is what makes a time-budget-limited run self-heal over successive daily runs instead of always favoring the same symbols. Exported standalone for testability without a live DB. */
export function prioritizeSymbolsByStaleness(symbols: string[], existing: Map<string, UniverseMetricsRow>): string[] {
  return [...symbols].sort((a, b) => {
    const aAge = existing.get(a)?.updatedAt ?? -1; // never-refreshed sorts first (smallest "age" timestamp)
    const bAge = existing.get(b)?.updatedAt ?? -1;
    return aAge - bAge;
  });
}

export interface RefreshResult {
  totalUniverse: number;
  quotesRefreshed: number;
  technicalsRefreshed: number;
  technicalsSkippedDueToTimeBudget: number;
  /** Count of technical lookups that came back with no data at all (rate-limited/timed-out/delisted) among the ones attempted this run — see technical.ts's doc comment on why an all-null result is treated as a failure signal, not a genuine "flat" reading. */
  technicalFetchFailures: number;
  durationMs: number;
}

/**
 * @param timeBudgetMs Soft wall-clock budget for the whole run (quotes +
 * as much of the technical pass as fits), measured from this function's
 * own start. Left with headroom below the cron route's maxDuration so
 * there's time left to finish the in-flight batch and return cleanly
 * rather than being hard-killed by the platform mid-write.
 */
export async function refreshStrategyUniverseMetrics(timeBudgetMs = 45_000): Promise<RefreshResult> {
  const startedAt = Date.now();
  const symbols = STRATEGY_UNIVERSE_SYMBOLS;

  // --- Pass 1: quotes for the whole universe, always, one batched call ---
  const quotes = await getStrategyQuotes(symbols);
  const now = Date.now();
  await upsertQuoteOnlyBatch(quotes, now);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  // --- Priority order for the technical pass: never-refreshed first, then oldest updated_at first ---
  const existing = await getUniverseMetricsFromDb(symbols);
  const prioritized = prioritizeSymbolsByStaleness(symbols, existing);

  // --- Pass 2: technical (RSI/SMA) lookups in priority order, upserted progressively ---
  let technicalsRefreshed = 0;
  const { failedCount } = await computeTechnicalValuesBatchedWithProgress(
    prioritized,
    async (batchResults: { symbol: string; values: TechnicalValues }[]) => {
      const rows: UniverseMetricsRow[] = batchResults.map(({ symbol, values }) => {
        const q = quoteBySymbol.get(symbol);
        return {
          symbol,
          name: q?.name || existing.get(symbol)?.name || symbol,
          price: q?.price ?? existing.get(symbol)?.price ?? null,
          changePercent: q?.changePercent ?? existing.get(symbol)?.changePercent ?? null,
          marketCap: q?.marketCap ?? existing.get(symbol)?.marketCap ?? null,
          peRatio: q?.peRatio ?? existing.get(symbol)?.peRatio ?? null,
          dividendYieldPercent: q?.dividendYieldPercent ?? existing.get(symbol)?.dividendYieldPercent ?? null,
          volume: q?.volume ?? existing.get(symbol)?.volume ?? null,
          rsi14: values.rsi14,
          priceVsSma50: values.priceVsSma50,
          priceVsSma200: values.priceVsSma200,
          updatedAt: now,
        };
      });
      await upsertUniverseMetricsBatch(rows);
      technicalsRefreshed += rows.length;
    },
    () => Date.now() - startedAt < timeBudgetMs
  );

  return {
    totalUniverse: symbols.length,
    quotesRefreshed: quotes.length,
    technicalsRefreshed,
    technicalsSkippedDueToTimeBudget: symbols.length - technicalsRefreshed,
    technicalFetchFailures: failedCount,
    durationMs: Date.now() - startedAt,
  };
}
