import { getStrategyQuotes, getPriceHistory, type StrategyQuote } from "@/lib/finance/yahoo";
import { computeRSI, computeSMA, closesFromHistory } from "@/lib/finance/indicators";
import { STRATEGY_UNIVERSE_SYMBOLS } from "@/lib/finance/symbols";
import type { ParsedStrategy, StrategyFilter, StrategyMetric, StrategyResultRow, StrategyRunResult } from "./types";

/**
 * Executes a validated ParsedStrategy (lib/strategy/parse.ts) against
 * STRATEGY_UNIVERSE_SYMBOLS (lib/finance/symbols.ts). Two-stage design,
 * deliberately in this order:
 *
 * 1. Quote-based filters (price/changePercent/marketCap/peRatio/
 *    dividendYieldPercent/volume) run first, against ONE batched quote
 *    call for the whole ~200-symbol universe (getStrategyQuotes) — cheap,
 *    already how this app fetches quotes everywhere else.
 * 2. Technical filters (rsi14/priceVsSma50/priceVsSma200) run second, and
 *    ONLY against whatever survived stage 1 — each one needs its own
 *    historical-bars fetch (getPriceHistory has no batched-many-symbols
 *    form, unlike quotes), so computing them for the full universe on
 *    every run regardless of the other filters would mean ~200 individual
 *    network calls for a strategy that, say, also wanted "market cap over
 *    $50B" and would have narrowed to a handful of names anyway. When a
 *    strategy has NO quote-based filters at all (e.g. "RSI under 30" on
 *    its own), stage 1 is a no-op and every universe symbol proceeds to
 *    stage 2 — bounded by MAX_TECHNICAL_LOOKUPS below rather than left
 *    uncapped.
 */

/** Hard cap on how many symbols ever get a historical-bars fetch in one run — see the module doc comment's stage-2 discussion for why this exists. */
const MAX_TECHNICAL_LOOKUPS = 60;
const DEFAULT_RESULT_LIMIT = 50;

const QUOTE_METRICS = new Set<StrategyMetric>([
  "price",
  "changePercent",
  "marketCap",
  "peRatio",
  "dividendYieldPercent",
  "volume",
]);
const TECHNICAL_METRICS = new Set<StrategyMetric>(["rsi14", "priceVsSma50", "priceVsSma200"]);

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

function quoteMetricValue(quote: StrategyQuote, metric: StrategyMetric): number | null {
  switch (metric) {
    case "price":
      return quote.price;
    case "changePercent":
      return quote.changePercent;
    case "marketCap":
      return quote.marketCap;
    case "peRatio":
      return quote.peRatio;
    case "dividendYieldPercent":
      return quote.dividendYieldPercent;
    case "volume":
      return quote.volume;
    default:
      return null;
  }
}

interface TechnicalValues {
  rsi14: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
}

async function computeTechnicalValues(symbol: string): Promise<TechnicalValues> {
  const history = await getPriceHistory(symbol, 260); // ~1 trading year, comfortably covers SMA-200 + RSI-14
  const closes = closesFromHistory(history);
  const latest = closes[closes.length - 1] ?? null;

  const rsi14 = computeRSI(closes, 14);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);

  return {
    rsi14,
    priceVsSma50: latest != null && sma50 != null && sma50 !== 0 ? ((latest - sma50) / sma50) * 100 : null,
    priceVsSma200: latest != null && sma200 != null && sma200 !== 0 ? ((latest - sma200) / sma200) * 100 : null,
  };
}

function technicalMetricValue(values: TechnicalValues, metric: StrategyMetric): number | null {
  switch (metric) {
    case "rsi14":
      return values.rsi14;
    case "priceVsSma50":
      return values.priceVsSma50;
    case "priceVsSma200":
      return values.priceVsSma200;
    default:
      return null;
  }
}

export async function executeStrategy(parsed: ParsedStrategy): Promise<StrategyRunResult> {
  const quoteFilters = parsed.filters.filter((f) => QUOTE_METRICS.has(f.metric));
  const technicalFilters = parsed.filters.filter((f) => TECHNICAL_METRICS.has(f.metric));
  const needsTechnical = technicalFilters.length > 0 || (parsed.sortBy != null && TECHNICAL_METRICS.has(parsed.sortBy));

  // --- Stage 1: quote-based filters against the whole universe ---
  const quotes = await getStrategyQuotes(STRATEGY_UNIVERSE_SYMBOLS);
  let survivors = quotes.filter((q) => quoteFilters.every((f) => passesFilter(quoteMetricValue(q, f.metric), f)));

  // --- Stage 2: technical filters, only for stage-1 survivors, capped ---
  const technicalBySymbol = new Map<string, TechnicalValues>();
  if (needsTechnical) {
    const lookupTargets = survivors.slice(0, MAX_TECHNICAL_LOOKUPS);
    const computed = await Promise.all(
      lookupTargets.map(async (q) => ({ symbol: q.symbol, values: await computeTechnicalValues(q.symbol) }))
    );
    for (const { symbol, values } of computed) technicalBySymbol.set(symbol, values);

    // Symbols beyond the cap never got a technical lookup — they can't
    // possibly satisfy a technical filter (missing data never matches,
    // per passesFilter), so they're dropped from `survivors` here rather
    // than silently kept and then failing every technical filter anyway.
    survivors = survivors.filter((q) => technicalBySymbol.has(q.symbol));
    survivors = survivors.filter((q) => {
      const values = technicalBySymbol.get(q.symbol)!;
      return technicalFilters.every((f) => passesFilter(technicalMetricValue(values, f.metric), f));
    });
  }

  // --- Sort ---
  const sortBy = parsed.sortBy;
  const sortDirection = parsed.sortDirection ?? "desc";
  if (sortBy) {
    survivors = [...survivors].sort((a, b) => {
      const av = TECHNICAL_METRICS.has(sortBy)
        ? technicalMetricValue(technicalBySymbol.get(a.symbol) ?? { rsi14: null, priceVsSma50: null, priceVsSma200: null }, sortBy)
        : quoteMetricValue(a, sortBy);
      const bv = TECHNICAL_METRICS.has(sortBy)
        ? technicalMetricValue(technicalBySymbol.get(b.symbol) ?? { rsi14: null, priceVsSma50: null, priceVsSma200: null }, sortBy)
        : quoteMetricValue(b, sortBy);
      // Missing values always sort last regardless of direction — same
      // convention as the existing Screener page's P/E-can-be-null sort.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av - bv;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  } else {
    // No explicit sort requested — default to market cap descending
    // (largest/most-recognizable names first), same default ordering the
    // existing Screener page's marketCapB column ships with.
    survivors = [...survivors].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  }

  const limit = Math.min(parsed.limit ?? DEFAULT_RESULT_LIMIT, DEFAULT_RESULT_LIMIT);
  const limited = survivors.slice(0, limit);

  const results: StrategyResultRow[] = limited.map((q) => {
    const technical = technicalBySymbol.get(q.symbol);
    return {
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
      marketCap: q.marketCap,
      peRatio: q.peRatio,
      dividendYieldPercent: q.dividendYieldPercent,
      volume: q.volume,
      rsi14: technical?.rsi14 ?? null,
      priceVsSma50: technical?.priceVsSma50 ?? null,
      priceVsSma200: technical?.priceVsSma200 ?? null,
    };
  });

  return { parsed, results, universeSize: STRATEGY_UNIVERSE_SYMBOLS.length };
}
