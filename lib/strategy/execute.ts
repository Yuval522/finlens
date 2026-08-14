import { getStrategyQuotes } from "@/lib/finance/yahoo";
import { STRATEGY_UNIVERSE_SYMBOLS } from "@/lib/finance/symbols";
import { computeTechnicalValuesBatched } from "./technical";
import { getUniverseMetricsFromDb, type UniverseMetricsRow } from "./universe-refresh";
import { STRATEGY_METRIC_LABELS, STRATEGY_OPERATOR_LABELS, formatStrategyMetricValue } from "./format";
import type { ParsedStrategy, StrategyFilter, StrategyMetric, StrategyResultRow, StrategyRunResult } from "./types";

/**
 * Executes a validated ParsedStrategy (lib/strategy/parse.ts) against
 * STRATEGY_UNIVERSE_SYMBOLS (lib/finance/symbols.ts).
 *
 * DB-first design (v2 — see git history for the prior live-fetch-only
 * design this replaced): every symbol's quote + technical (RSI/SMA) data
 * is read from the strategy_universe_metrics table in ONE query, populated
 * in the background by app/api/cron/refresh-strategy-universe (see
 * lib/strategy/universe-refresh.ts). This is what makes a screening query
 * fast and immune to Yahoo Finance rate limits at request time — there's
 * normally no live network call in the request path at all.
 *
 * A symbol with NO row in the table yet (a fresh deploy before the first
 * cron run, or a symbol just added to STRATEGY_UNIVERSE_SYMBOLS) falls
 * back to a live fetch, capped and prioritized the same way this file
 * always has been (see fetchLiveSnapshot below) — this is now purely a
 * gap-filler for the steady state, not the primary path.
 */

const DEFAULT_RESULT_LIMIT = 50;
const RELAXED_RESULT_COUNT = 10;
/** Cap on live-fallback technical lookups per request — see this file's doc comment. Same rationale/value as the pre-DB design: an uncontrolled burst against Yahoo's unofficial endpoint risks rate-limiting, and this path should rarely be exercised at all once the refresh cron has run at least once. */
const MAX_LIVE_FALLBACK_LOOKUPS = 60;

function metricValue(row: UniverseMetricsRow, metric: StrategyMetric): number | null {
  switch (metric) {
    case "price":
      return row.price;
    case "changePercent":
      return row.changePercent;
    case "marketCap":
      return row.marketCap;
    case "peRatio":
      return row.peRatio;
    case "dividendYieldPercent":
      return row.dividendYieldPercent;
    case "volume":
      return row.volume;
    case "rsi14":
      return row.rsi14;
    case "priceVsSma50":
      return row.priceVsSma50;
    case "priceVsSma200":
      return row.priceVsSma200;
  }
}

function passesFilter(value: number | null, filter: StrategyFilter): boolean {
  if (value == null) return false; // missing data never matches — never guess/default a filter comparison
  switch (filter.operator) {
    case "gt":
      return value > filter.value;
    case "gte":
      return value >= filter.value;
    case "lt":
      return value < filter.value;
    case "lte":
      return value <= filter.value;
    case "eq":
      return value === filter.value;
  }
}

/**
 * Fetches a live UniverseMetricsRow-shaped snapshot for symbols missing
 * from the precomputed table. Quotes are fetched for ALL of them (cheap,
 * one batched call) so quote-based filters are still correct regardless of
 * the technical-lookup cap; technical (RSI/SMA) lookups are capped and
 * prioritized by market cap, same as this file's pre-DB design.
 */
async function fetchLiveSnapshot(missingSymbols: string[]): Promise<Map<string, UniverseMetricsRow>> {
  const quotes = await getStrategyQuotes(missingSymbols);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const prioritized = [...quotes]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, MAX_LIVE_FALLBACK_LOOKUPS)
    .map((q) => q.symbol);
  const { bySymbol: technicalBySymbol, failedCount } = await computeTechnicalValuesBatched(prioritized);

  if (missingSymbols.length > 20) {
    console.warn(
      `[FinLens] executeStrategy — ${missingSymbols.length}/${STRATEGY_UNIVERSE_SYMBOLS.length} symbols had no ` +
        "precomputed data (strategy_universe_metrics not yet warmed by the refresh cron?) — falling back to a " +
        `live fetch for up to ${MAX_LIVE_FALLBACK_LOOKUPS} of them. This should self-resolve once ` +
        "app/api/cron/refresh-strategy-universe has run at least once."
    );
  }
  if (prioritized.length > 0 && failedCount / prioritized.length > 0.5) {
    console.warn(
      `[FinLens] executeStrategy — ${failedCount}/${prioritized.length} live-fallback technical lookups came back ` +
        "with no data, likely Yahoo rate-limiting this batch."
    );
  }

  const now = Date.now();
  const result = new Map<string, UniverseMetricsRow>();
  for (const symbol of missingSymbols) {
    const q = quoteBySymbol.get(symbol);
    const t = technicalBySymbol.get(symbol);
    result.set(symbol, {
      symbol,
      name: q?.name || symbol,
      price: q?.price ?? null,
      changePercent: q?.changePercent ?? null,
      marketCap: q?.marketCap ?? null,
      peRatio: q?.peRatio ?? null,
      dividendYieldPercent: q?.dividendYieldPercent ?? null,
      volume: q?.volume ?? null,
      rsi14: t?.rsi14 ?? null,
      priceVsSma50: t?.priceVsSma50 ?? null,
      priceVsSma200: t?.priceVsSma200 ?? null,
      updatedAt: now,
    });
  }
  return result;
}

/**
 * Normalized "how far from passing" gap for one filter, used only by the
 * relaxed/near-miss fallback below — NOT by passesFilter, which stays
 * exact. 0 means the filter already passes; otherwise a positive number
 * scaled by the filter's own threshold magnitude, so gaps across very
 * different metrics/units (RSI points vs. dollars of market cap) are at
 * least roughly comparable as "fraction of the target you're off by"
 * rather than raw, incomparable absolute differences. Infinity for missing
 * data — a candidate that's missing a value a filter needs can't honestly
 * be called "close" to passing it.
 */
function filterGap(value: number | null, filter: StrategyFilter): number {
  if (value == null) return Infinity;
  const scale = Math.abs(filter.value) || 1;
  switch (filter.operator) {
    case "gt":
    case "gte":
      return Math.max(0, filter.value - value) / scale;
    case "lt":
    case "lte":
      return Math.max(0, value - filter.value) / scale;
    case "eq":
      return Math.abs(value - filter.value) / scale;
  }
}

function buildAlmostMatchNote(row: UniverseMetricsRow, filters: StrategyFilter[]): string | null {
  const missed = filters
    .filter((f) => !passesFilter(metricValue(row, f.metric), f))
    .map((f) => {
      const value = metricValue(row, f.metric);
      const label = STRATEGY_METRIC_LABELS[f.metric];
      const actual = value == null ? "unavailable" : formatStrategyMetricValue(f.metric, value);
      const target = `${STRATEGY_OPERATOR_LABELS[f.operator]} ${formatStrategyMetricValue(f.metric, f.value)}`;
      return `${label} is ${actual} (target: ${target})`;
    });
  return missed.length > 0 ? missed.join("; ") : null;
}

/**
 * Zero strict matches doesn't have to mean a dead-end empty screen — this
 * ranks every candidate with COMPLETE data for the requested filters by
 * total normalized gap (see filterGap) and returns the closest N. A
 * candidate missing data for any filtered metric is excluded entirely
 * (Infinity gap) rather than shown as a misleading "close" result.
 */
function findClosestMatches(
  rows: UniverseMetricsRow[],
  filters: StrategyFilter[],
  count: number
): UniverseMetricsRow[] {
  return rows
    .map((row) => ({ row, gap: filters.reduce((sum, f) => sum + filterGap(metricValue(row, f.metric), f), 0) }))
    .filter((s) => Number.isFinite(s.gap))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, count)
    .map((s) => s.row);
}

export async function executeStrategy(parsed: ParsedStrategy): Promise<StrategyRunResult> {
  const symbols = STRATEGY_UNIVERSE_SYMBOLS;

  const dbRows = await getUniverseMetricsFromDb(symbols);
  const missingSymbols = symbols.filter((s) => !dbRows.has(s));
  const liveRows = missingSymbols.length > 0 ? await fetchLiveSnapshot(missingSymbols) : new Map<string, UniverseMetricsRow>();

  const snapshot = new Map<string, UniverseMetricsRow>();
  for (const [symbol, row] of dbRows) snapshot.set(symbol, row);
  for (const [symbol, row] of liveRows) snapshot.set(symbol, row);

  const allRows = symbols.map((s) => snapshot.get(s)).filter((r): r is UniverseMetricsRow => r != null);

  let dataAsOf: number | null = null;
  for (const row of allRows) {
    if (dataAsOf === null || row.updatedAt < dataAsOf) dataAsOf = row.updatedAt;
  }

  let survivors = allRows.filter((row) => parsed.filters.every((f) => passesFilter(metricValue(row, f.metric), f)));

  let relaxed = false;
  let relaxedNote: string | null = null;
  if (survivors.length === 0 && parsed.filters.length > 0) {
    const closest = findClosestMatches(allRows, parsed.filters, RELAXED_RESULT_COUNT);
    if (closest.length > 0) {
      survivors = closest;
      relaxed = true;
      relaxedNote =
        closest.length === 1
          ? "No stocks matched every condition exactly — showing the single closest match instead."
          : `No stocks matched every condition exactly — showing the ${closest.length} closest matches instead.`;
    }
  }

  // --- Sort ---
  const sortBy = parsed.sortBy;
  const sortDirection = parsed.sortDirection ?? "desc";
  if (!relaxed && sortBy) {
    survivors = [...survivors].sort((a, b) => {
      const av = metricValue(a, sortBy);
      const bv = metricValue(b, sortBy);
      // Missing values always sort last regardless of direction — same
      // convention as the existing Screener page's P/E-can-be-null sort.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av - bv;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  } else if (!relaxed) {
    // No explicit sort requested — default to market cap descending
    // (largest/most-recognizable names first), same default ordering the
    // existing Screener page's marketCapB column ships with. Relaxed
    // results are already meaningfully ordered by closeness-to-matching
    // (findClosestMatches) — re-sorting by an unrelated default would
    // throw that ordering away.
    survivors = [...survivors].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  }

  const limit = relaxed ? survivors.length : Math.min(parsed.limit ?? DEFAULT_RESULT_LIMIT, DEFAULT_RESULT_LIMIT);
  const limited = survivors.slice(0, limit);

  const results: StrategyResultRow[] = limited.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    price: row.price,
    changePercent: row.changePercent,
    marketCap: row.marketCap,
    peRatio: row.peRatio,
    dividendYieldPercent: row.dividendYieldPercent,
    volume: row.volume,
    rsi14: row.rsi14,
    priceVsSma50: row.priceVsSma50,
    priceVsSma200: row.priceVsSma200,
    almostMatchNote: relaxed ? buildAlmostMatchNote(row, parsed.filters) : null,
  }));

  return { parsed, results, universeSize: symbols.length, relaxed, relaxedNote, dataAsOf };
}
