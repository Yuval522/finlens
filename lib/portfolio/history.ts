import type { PortfolioCash, PortfolioHolding } from "./store";
import type { PricePoint } from "@/lib/finance/types";
import { USD_TO_ILS_RATE } from "./derive";

/**
 * Historical portfolio valuation: current holdings, real historical prices.
 *
 * QA fix history: this file originally replaced an even older straight-line
 * ramp generator (lib/portfolio/mock-history.ts.bak) with a transaction-
 * ledger replay — shares-held-as-of-date, computed strictly from dated
 * buy/sell/adjustment entries, times that date's real closing price. That
 * was more "honest" in principle, but it produced its own bad artifact in
 * practice: a holding bought through the UI logs a real transaction dated
 * *today* (see makeBuyTransaction's `date = todayIso()` default), so
 * sharesHeldAsOf() correctly returns 0 for every date before today — the
 * chart showed a flat line at the position's pre-purchase (i.e. zero)
 * contribution, then a sudden vertical spike on today's date the moment the
 * real transaction became "in effect". Live report + screenshot confirmed
 * exactly this: flat line for the whole 1Y range, spike at the very end.
 *
 * Fix: reconstructPortfolioHistory() now prices CURRENT holdings'
 * quantities (straight from `holdings`/`cash`, always the accurate "as of
 * today" snapshot the rest of the Portfolio page reads from) against real
 * historical closes across the ENTIRE selected window — i.e. "what would
 * this exact portfolio be worth if you'd held these exact quantities the
 * whole time" — rather than gating each day's contribution on whether a
 * real transaction had technically been logged by that date yet. This is
 * the standard "current position, historical price" curve every brokerage
 * app shows, and it's what the user explicitly asked for: a realistic,
 * fluctuating performance line driven by actual market history, not a
 * flat-to-spike artifact of transaction bookkeeping. Cash is held at its
 * current balance for every plotted date for the same reason — the chart
 * is answering "how has today's portfolio composition performed," not
 * replaying historical cash movements.
 *
 * The transaction ledger (PortfolioTransaction, sharesHeldAsOf, cashAsOf)
 * is kept as-is below — store.ts still logs every buy/sell/adjustment/cash
 * edit through it, and it remains the right data source for a future
 * "transaction history" list UI — it's just no longer what drives this
 * chart's value curve.
 */

export type PortfolioRange = "1W" | "1M" | "1Y" | "ALL";
export const PORTFOLIO_RANGES: PortfolioRange[] = ["1W", "1M", "1Y", "ALL"];

const RANGE_CONFIG: Record<PortfolioRange, { days: number; stepDays: number }> = {
  "1W": { days: 7, stepDays: 1 },
  "1M": { days: 30, stepDays: 1 },
  "1Y": { days: 365, stepDays: 7 },
  ALL: { days: 730, stepDays: 14 },
};

export type TransactionKind = "buy" | "sell" | "adjustment" | "cash";

/**
 * One immutable ledger entry. `sharesDelta`/`cashDelta` are always SIGNED —
 * positive = increases the position/pool, negative = decreases it — so
 * reconstructing "as of date X" is always a plain sum-and-filter, no
 * branching on `kind` required. `kind` is purely a display/provenance
 * label (buy, sell, a manual share-count correction via updateHolding, or
 * a manual cash edit via updateCash) plus what distinguishes a REAL entry
 * from a synthetic bootstrap one (see buildBootstrapTransactions).
 */
export interface PortfolioTransaction {
  id: string;
  /** ISO "YYYY-MM-DD". String comparison is chronological for this format, so no Date parsing needed to order/filter entries. */
  date: string;
  /** null only for a pure cash transaction (a manual Cash Balance edit) not tied to any symbol. */
  symbol: string | null;
  sharesDelta: number;
  /** Price per share at the time, display-currency units — informational only (shown in a future "transaction history" UI); NOT used by the valuation math below, which always prices by that date's real historical close instead. */
  price: number;
  /** Which PortfolioCash pool cashDelta affects — same "ILA settles in ils, everything else settles in usd" convention as store.ts's cashPoolForCurrency. */
  pool: "usd" | "ils";
  cashDelta: number;
  kind: TransactionKind;
}

export interface PortfolioValuePoint {
  date: string;
  value: number;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Same currency->pool convention as store.ts's cashPoolForCurrency (not imported directly to avoid a client-store <-> history.ts circular import; the rule itself is tiny and stable). */
export function poolForCurrency(currency: string): "usd" | "ils" {
  return currency === "ILA" ? "ils" : "usd";
}

export function makeBuyTransaction(symbol: string, shares: number, price: number, currency: string, date = todayIso()): PortfolioTransaction {
  return { id: makeId(), date, symbol: symbol.toUpperCase(), sharesDelta: shares, price, pool: poolForCurrency(currency), cashDelta: -(shares * price), kind: "buy" };
}

export function makeSellTransaction(symbol: string, shares: number, price: number, currency: string, date = todayIso()): PortfolioTransaction {
  return { id: makeId(), date, symbol: symbol.toUpperCase(), sharesDelta: -shares, price, pool: poolForCurrency(currency), cashDelta: shares * price, kind: "sell" };
}

/** Logged for a share-count correction via updateHolding — deliberately zero cashDelta, matching that function's existing "doesn't touch Cash Balance" contract. */
export function makeAdjustmentTransaction(symbol: string, sharesDelta: number, price: number, currency: string, date = todayIso()): PortfolioTransaction {
  return { id: makeId(), date, symbol: symbol.toUpperCase(), sharesDelta, price, pool: poolForCurrency(currency), cashDelta: 0, kind: "adjustment" };
}

/** Logged for a manual Cash Balance edit via updateCash — not tied to any symbol. */
export function makeCashTransaction(pool: "usd" | "ils", cashDelta: number, date = todayIso()): PortfolioTransaction {
  return { id: makeId(), date, symbol: null, sharesDelta: 0, price: 0, pool, cashDelta, kind: "cash" };
}

/** Cumulative shares held in `symbol` as of (inclusive of) `asOfDate`, replaying every transaction dated on or before it. */
export function sharesHeldAsOf(transactions: PortfolioTransaction[], symbol: string, asOfDate: string): number {
  const sym = symbol.toUpperCase();
  let total = 0;
  for (const t of transactions) {
    if (t.symbol === sym && t.date <= asOfDate) total += t.sharesDelta;
  }
  return total;
}

/** Cumulative cash in `pool` as of (inclusive of) `asOfDate`. */
export function cashAsOf(transactions: PortfolioTransaction[], pool: "usd" | "ils", asOfDate: string): number {
  let total = 0;
  for (const t of transactions) {
    if (t.pool === pool && t.date <= asOfDate) total += t.cashDelta;
  }
  return total;
}

/** Builds a `date -> close` lookup with forward-fill: markets are closed on weekends/holidays, so a plotted calendar date that isn't itself a trading day resolves to the most recent trading day's close at or before it. Returns null for a date entirely before the earliest fetched bar (e.g. requesting a value before the symbol had any price history). */
function buildCloseLookup(points: PricePoint[]): (date: string) => number | null {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return (date: string): number | null => {
    let result: number | null = null;
    for (const p of sorted) {
      if (p.date > date) break;
      result = p.close;
    }
    return result;
  };
}

function datesForRange(range: PortfolioRange): string[] {
  const { days, stepDays } = RANGE_CONFIG[range];
  const today = new Date();
  const dates: string[] = [];
  for (let d = days; d >= 0; d -= stepDays) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    dates.push(date.toISOString().slice(0, 10));
  }
  const todayStr = todayIso();
  if (dates[dates.length - 1] !== todayStr) dates.push(todayStr);
  return dates;
}

/**
 * Reconstructs day-by-day portfolio value: for each plotted date, EVERY
 * currently-held symbol's CURRENT share count (from `holdings`, not a
 * ledger replay) times that date's real historical closing price, summed
 * across all holdings, plus the CURRENT cash balance (both pools, ILS
 * converted to USD at the same fixed display rate the rest of the app uses
 * — see derive.ts's USD_TO_ILS_RATE) held constant across the whole range.
 * See the module doc comment above for why this replaced an earlier
 * ledger-replay approach that produced a flat-line-then-spike artifact for
 * any holding with a real, dated (i.e. "today") transaction behind it.
 *
 * `transactions` is still accepted (the client already has it in memory
 * and the API route already validates it) but is intentionally unused by
 * this calculation now — kept for signature/route stability and in case a
 * future feature (e.g. per-transaction markers on the chart) wants it.
 *
 * `fetchHistory` is injected (rather than importing lib/finance/yahoo.ts's
 * getPriceHistory directly) so this stays a pure, framework-agnostic module
 * callable from a standalone test with synthetic price fixtures — the real
 * caller (app/api/portfolio/history/route.ts) passes the real
 * getPriceHistory, since that function depends on the Node-only
 * yahoo-finance2 package and can't run in this client-safe module.
 */
export async function reconstructPortfolioHistory(
  transactions: PortfolioTransaction[],
  holdings: PortfolioHolding[],
  cash: PortfolioCash,
  range: PortfolioRange,
  fetchHistory: (symbol: string, days: number) => Promise<PricePoint[]>
): Promise<PortfolioValuePoint[]> {
  void transactions;

  const { days } = RANGE_CONFIG[range];
  const dates = datesForRange(range);

  // Extra lookback buffer past `days` so the very first plotted date can
  // still forward-fill from the last trading day before it (e.g. plotting
  // a Monday needs Friday's close, which is outside a bare `days`-back
  // window when `days` lands exactly on that Monday).
  const fetchDays = days + 14;
  const historyBySymbol = new Map<string, (date: string) => number | null>();
  await Promise.all(
    holdings.map(async (h) => {
      const symbol = h.symbol.toUpperCase();
      const points = await fetchHistory(symbol, fetchDays);
      historyBySymbol.set(symbol, buildCloseLookup(points));
    })
  );

  const cashUsd = cash.usd + cash.ils / USD_TO_ILS_RATE;

  const points: PortfolioValuePoint[] = dates.map((date) => {
    let positionsValue = 0;
    for (const h of holdings) {
      const symbol = h.symbol.toUpperCase();
      const close = historyBySymbol.get(symbol)?.(date);
      // If real history doesn't reach this far back (e.g. a symbol newer
      // than the charted range, or a fetch that came back empty), fall
      // back to the holding's last-known price rather than silently
      // dropping the position's contribution for that date.
      const price = close ?? h.currentPrice;
      positionsValue += h.shares * price;
    }
    return { date, value: Number((positionsValue + cashUsd).toFixed(2)) };
  });

  return points;
}
