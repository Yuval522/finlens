import type { PortfolioCash, PortfolioHolding } from "./store";
import type { PricePoint } from "@/lib/finance/types";
import { USD_TO_ILS_RATE } from "./derive";

/**
 * Transaction-aware historical portfolio valuation.
 *
 * QA fix (live report: the "Portfolio Value" chart showed an artificial
 * straight diagonal ramp from cost basis to today's value — see the old
 * lib/portfolio/mock-history.ts, now retired/renamed to .bak). That
 * generator had no real data to work with: lib/portfolio/store.ts only ever
 * tracked *current* aggregate state (blended shares/cost-basis per symbol,
 * a single cash number) with no record of *when* anything happened, so a
 * straight-line interpolation between two numbers was the only thing
 * possible. This file replaces that with a real day-by-day reconstruction:
 * an append-only transaction ledger (see PortfolioTransaction below, now
 * populated by addHolding/sellHolding/updateHolding/updateCash in store.ts)
 * replayed against real historical closing prices (lib/finance/yahoo.ts's
 * getPriceHistory) to compute what the portfolio was actually worth on each
 * past date.
 *
 * Bootstrap/legacy-data handling: a holding added before this feature
 * shipped (or a browser's pre-existing localStorage state) has no dated
 * purchase transaction behind it — store.ts's SEED_DATA and any
 * previously-saved portfolio only ever recorded a blended `shares`/
 * `purchasePrice`, never a date. Rather than fabricate a fake purchase
 * date (which would just be a different flavor of made-up history),
 * reconstructPortfolioHistory() reconciles the ledger against the
 * portfolio's real current totals: whatever share count / cash isn't
 * already accounted for by real, dated transactions is treated as having
 * been fully in place at the START of whatever range is currently being
 * charted (see buildBootstrapTransactions below). This means: (a) a
 * brand-new position bought through the UI today reconstructs with 100%
 * real transaction dates and is identical across every range, (b) a
 * legacy/undated holding still gets a REAL, price-driven curve for the
 * requested window (cost-basis-ish starting point -> today, moving with
 * actual market closes in between) instead of a synthetic ramp+noise, it
 * just can't claim to know what happened *before* the window starts, and
 * (c) switching between 1W/1M/1Y/ALL for a legacy holding can show a
 * different starting composition, which is the honest consequence of not
 * knowing the true purchase date beyond "at or before this range began" —
 * exactly how a brokerage with partial history would present it.
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

/**
 * Reconciles the real ledger against the portfolio's current true totals
 * (`holdings`/`cash` — always accurate "as of today" regardless of ledger
 * completeness, since those are what every other card on the Portfolio page
 * already reads from). Whatever gap exists between what the REAL ledger
 * alone would produce for today and the actual current totals gets filled
 * by one synthetic entry per symbol/pool, dated at `sinceDate` (the start
 * of whichever range is currently being charted — see reconstructPortfolioHistory).
 * A fully up-to-date ledger (every current share/cash figure already
 * explained by real transactions) produces zero bootstrap entries here.
 */
function buildBootstrapTransactions(
  realTransactions: PortfolioTransaction[],
  holdings: PortfolioHolding[],
  cash: PortfolioCash,
  sinceDate: string
): PortfolioTransaction[] {
  const bootstrap: PortfolioTransaction[] = [];
  const today = todayIso();

  for (const h of holdings) {
    const symbol = h.symbol.toUpperCase();
    const ledgerShares = sharesHeldAsOf(realTransactions, symbol, today);
    const gap = h.shares - ledgerShares;
    if (Math.abs(gap) > 1e-9) {
      bootstrap.push({
        id: `bootstrap-${symbol}`,
        date: sinceDate,
        symbol,
        sharesDelta: gap,
        price: h.purchasePrice,
        pool: poolForCurrency(h.currency),
        cashDelta: 0,
        kind: "adjustment",
      });
    }
  }

  for (const pool of ["usd", "ils"] as const) {
    const ledgerCash = cashAsOf(realTransactions, pool, today);
    const gap = cash[pool] - ledgerCash;
    if (Math.abs(gap) > 1e-9) {
      bootstrap.push({ id: `bootstrap-cash-${pool}`, date: sinceDate, symbol: null, sharesDelta: 0, price: 0, pool, cashDelta: gap, kind: "cash" });
    }
  }

  return bootstrap;
}

/** Every distinct symbol that ever appears in the ledger or current holdings — including a position that was fully sold within the charted window, so its (now-zero) contribution is still computed correctly for the days it WAS held rather than silently omitted. */
function collectSymbols(transactions: PortfolioTransaction[], holdings: PortfolioHolding[]): string[] {
  const set = new Set<string>();
  for (const h of holdings) set.add(h.symbol.toUpperCase());
  for (const t of transactions) if (t.symbol) set.add(t.symbol);
  return [...set];
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
 * Reconstructs true day-by-day portfolio value: for each plotted date,
 * shares-held-as-of-that-date (per symbol, from the ledger) times that
 * date's real historical closing price, summed across every symbol, plus
 * cash-as-of-that-date (both pools, ILS converted to USD at the same fixed
 * display rate the rest of the app uses — see derive.ts's USD_TO_ILS_RATE).
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
  const { days } = RANGE_CONFIG[range];
  const dates = datesForRange(range);
  const sinceDate = dates[0];

  const bootstrap = buildBootstrapTransactions(transactions, holdings, cash, sinceDate);
  const combined = [...transactions, ...bootstrap];
  const symbols = collectSymbols(combined, holdings);

  // Extra lookback buffer past `days` so the very first plotted date can
  // still forward-fill from the last trading day before it (e.g. plotting
  // a Monday needs Friday's close, which is outside a bare `days`-back
  // window when `days` lands exactly on that Monday).
  const fetchDays = days + 14;
  const historyBySymbol = new Map<string, (date: string) => number | null>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const points = await fetchHistory(symbol, fetchDays);
      historyBySymbol.set(symbol, buildCloseLookup(points));
    })
  );

  const points: PortfolioValuePoint[] = dates.map((date) => {
    let positionsValue = 0;
    for (const symbol of symbols) {
      const shares = sharesHeldAsOf(combined, symbol, date);
      if (Math.abs(shares) < 1e-9) continue;
      const close = historyBySymbol.get(symbol)?.(date);
      if (close != null) positionsValue += shares * close;
    }
    const cashUsd = cashAsOf(combined, "usd", date) + cashAsOf(combined, "ils", date) / USD_TO_ILS_RATE;
    return { date, value: Number((positionsValue + cashUsd).toFixed(2)) };
  });

  return points;
}
