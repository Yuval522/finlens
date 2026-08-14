import { getPriceHistory } from "@/lib/finance/yahoo";
import { computeRSI, computeSMA, closesFromHistory } from "@/lib/finance/indicators";

/**
 * Shared technical-indicator computation for the Natural Language Strategy
 * Builder — used by BOTH the request-time execution engine
 * (lib/strategy/execute.ts, for symbols missing a precomputed row) and the
 * background universe-refresh cron job (lib/strategy/universe-refresh.ts).
 * Extracted into its own module rather than left in execute.ts so those two
 * call sites can never drift into computing RSI/SMA slightly differently —
 * a single source of truth for what "this symbol's technicals" means.
 */

export interface TechnicalValues {
  rsi14: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
}

export async function computeTechnicalValues(symbol: string): Promise<TechnicalValues> {
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

/**
 * Fires getPriceHistory() calls in small sequential batches rather than one
 * large concurrent burst. Against an unofficial, unauthenticated Yahoo
 * endpoint, an uncontrolled N-way concurrent burst from one invocation is a
 * realistic way to trip rate limiting — and because getPriceHistory catches
 * its own errors and returns `[]` rather than throwing (so one bad symbol
 * can't fail an entire run), a burst-triggered wave of failures wouldn't
 * surface as an error anywhere: every technical filter would just quietly
 * evaluate against null data (see this module's callers for how that's
 * handled). Batching cuts peak burst size and gives Yahoo's endpoint (and
 * getPriceHistory's own per-symbol timeout race) breathing room.
 */
const TECHNICAL_LOOKUP_BATCH_SIZE = 12;

export interface TechnicalBatchResult {
  bySymbol: Map<string, TechnicalValues>;
  failedCount: number;
}

export async function computeTechnicalValuesBatched(symbols: string[]): Promise<TechnicalBatchResult> {
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

/**
 * Batched version that also invokes a callback after EACH batch completes,
 * with that batch's results — used by universe-refresh.ts to upsert
 * progressively as it goes, so a run that gets cut off partway (e.g. by a
 * serverless function's time budget) still persists whatever it managed to
 * compute rather than losing all progress. computeTechnicalValuesBatched
 * above (used by the request-time path, which just needs a final map, not
 * incremental persistence) is kept as the simpler function for that caller
 * rather than forcing every caller through a callback-shaped API.
 */
export async function computeTechnicalValuesBatchedWithProgress(
  symbols: string[],
  onBatch: (batch: { symbol: string; values: TechnicalValues }[]) => Promise<void> | void,
  shouldContinue: () => boolean = () => true
): Promise<TechnicalBatchResult> {
  const bySymbol = new Map<string, TechnicalValues>();
  let failedCount = 0;
  for (let i = 0; i < symbols.length; i += TECHNICAL_LOOKUP_BATCH_SIZE) {
    if (!shouldContinue()) break;
    const batch = symbols.slice(i, i + TECHNICAL_LOOKUP_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (symbol) => ({ symbol, values: await computeTechnicalValues(symbol) }))
    );
    for (const { symbol, values } of results) {
      bySymbol.set(symbol, values);
      if (values.rsi14 == null && values.priceVsSma50 == null && values.priceVsSma200 == null) failedCount++;
    }
    await onBatch(results);
  }
  return { bySymbol, failedCount };
}
