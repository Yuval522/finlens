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

/**
 * Stage 2 fires one getPriceHistory() call per lookup target — each a real
 * Yahoo chart() network request (lib/finance/yahoo.ts). This used to fire
 * all of them at once via a single Promise.all across up to
 * MAX_TECHNICAL_LOOKUPS (60) symbols. Against an unofficial, unauthenticated
 * endpoint, a 60-way concurrent burst from one serverless invocation is a
 * realistic way to trip Yahoo's own rate limiting — and because
 * getPriceHistory catches its own errors and returns `[]` rather than
 * throwing (by design, so one bad symbol can't fail an entire screener
 * run — see that function's doc comment), a burst-triggered wave of
 * failures wouldn't surface as an error anywhere: every technical filter
 * would just quietly evaluate against `null` data for every symbol
 * (missing data never matches, per passesFilter) and the run would return
 * zero results with a normal 200 response — indistinguishable from "no
 * stocks genuinely match" from the API's perspective. This runs the
 * lookups in smaller sequential batches instead, which cuts the peak
 * burst size and gives Yahoo's endpoint (and this function's per-symbol
 * timeout race) breathing room, while still completing well within one
 * request's lifetime for a universe this size.
 */
const TECHNICAL_LOOKUP_BATCH_SIZE = 12;

async function computeTechnicalValuesBatched(
  symbols: string[]
): Promise<{ bySymbol: Map<string, TechnicalValues>; failedCount: number }> {
  const bySymbol = new Map<string, TechnicalValues>();
  let failedCount = 0;
  for (let i = 0; i < symbols.length; i += TECHNICAL_LOOKUP_BATCH_SIZE) {
    const batch = symbols.slice(i, i + TECHNICAL_LOOKUP_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (symbol) => ({ symbol, values: await computeTechnicalValues(symbol) }))
    );
    for (const { symbol, values } of results) {
      bySymbol.set(symbol, values);
      // A lookup that returned every field null almost always means
      // getPriceHistory silently came back empty for this symbol (rate
      // limit, timeout, or a genuinely delisted/renamed ticker) rather
      // than "this stock has flat/undefined technicals" — real price
      // history essentially never produces null RSI/SMA-vs-price for a
      // liquid, actively-traded universe symbol.
      if (values.rsi14 == null && values.priceVsSma50 == null && values.priceVsSma200 == null) failedCount++;
    }
  }
  return { bySymbol, failedCount };
}

export async function executeStrategy(parsed: ParsedStrategy): Promise<StrategyRunResult> {
  const quoteFilters = parsed.filters.filter((f) => QUOTE_METRICS.has(f.metric));
  const technicalFilters = parsed.filters.filter((f) => TECHNICAL_METRICS.has(f.metric));
  const needsTechnical = technicalFilters.length > 0 || (parsed.sortBy != null && TECHNICAL_METRICS.has(parsed.sortBy));

  // --- Stage 1: quote-based filters against the whole universe ---
  const quotes = await getStrategyQuotes(STRATEGY_UNIVERSE_SYMBOLS);
  let survivors = quotes.filter((q) => quoteFilters.every((f) => passesFilter(quoteMetricValue(q, f.metric), f)));

  // --- Stage 2: technical filters, only for stage-1 survivors, capped ---
  let technicalBySymbol = new Map<string, TechnicalValues>();
  if (needsTechnical) {
    // Prioritize by market cap descending before applying the
    // MAX_TECHNICAL_LOOKUPS cap — STRATEGY_UNIVERSE_SYMBOLS is grouped by
    // GICS sector (Technology first, then Financials, ...), so slicing
    // stage-1 survivors in their raw list order silently gave near-total
    // Technology-sector coverage and near-zero coverage everywhere else
    // whenever survivors exceeded the cap, an accident of list ordering
    // rather than a deliberate relevance choice. Largest-first ensures the
    // symbols that get a technical lookup are consistently the most
    // liquid/relevant ones regardless of which sectors happen to survive
    // stage 1, or how STRATEGY_UNIVERSE_SYMBOLS happens to be ordered.
    const prioritized = [...survivors].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    const lookupTargets = prioritized.slice(0, MAX_TECHNICAL_LOOKUPS);
    const { bySymbol, failedCount } = await computeTechnicalValuesBatched(lookupTargets.map((q) => q.symbol));
    technicalBySymbol = bySymbol;

    if (lookupTargets.length > 0 && failedCount / lookupTargets.length > 0.5) {
      // Loud, specific, and actionable — this is exactly the failure mode
      // that otherwise looks identical to "nothing matched" from the
      // outside (see this function's doc comment above).
      console.warn(
        `[FinLens] executeStrategy — ${failedCount}/${lookupTargets.length} technical (RSI/SMA) lookups came back ` +
          "with no data, likely Yahoo rate-limiting this batch rather than a genuine lack of matches. " +
          "Technical filter results for this run may be artificially low."
      );
    }

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
