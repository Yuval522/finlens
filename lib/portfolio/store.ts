"use client";

import { useSyncExternalStore } from "react";
import { toDisplayUnit } from "@/lib/format/currency";
import {
  makeAdjustmentTransaction,
  makeBuyTransaction,
  makeCashTransaction,
  makeSellTransaction,
  poolForCurrency,
  type PortfolioTransaction,
} from "./history";

/**
 * Client-only portfolio store, persisted to localStorage — same rationale
 * and same module-level-store + useSyncExternalStore pattern as
 * lib/watchlist/store.ts (see that file's doc comment): Stox has no
 * user accounts/backend database, so "your portfolio" means "remembered on
 * this browser." Seeded on first-ever visit with a realistic sample
 * portfolio (see SEED_DATA below) so the page shows real charts/tables
 * immediately instead of the old empty-state stub.
 */

export interface PortfolioHolding {
  symbol: string;
  name: string;
  /** Currency the holding is priced in — ISO-ish code as used across lib/finance (USD, ILA, ...). */
  currency: string;
  shares: number;
  /** Cost basis per share, display units (already agorot->shekels etc converted). */
  purchasePrice: number;
  /** Most recently known price per share, display units. Seeded with a
   * realistic mock value; overwritten once a live /api/quotes fetch
   * succeeds, and that live value is persisted so it keeps showing on
   * future visits even if a later fetch fails (offline/rate-limited). */
  currentPrice: number;
  /** Today's % move, seeded/overwritten alongside currentPrice — drives the Daily Gain/Loss card. */
  changePercent: number;
  /** Blended annual dividend yield, percent (e.g. 0.44 = 0.44%). */
  dividendYieldPercent: number;
  /** Cumulative dividends received on this position to date, display-currency units. */
  dividendsPaid: number;
}

export interface PortfolioCash {
  usd: number;
  ils: number;
}

interface PortfolioData {
  holdings: PortfolioHolding[];
  cash: PortfolioCash;
  /**
   * Transaction-Aware Historical Portfolio Value fix: append-only ledger of
   * every buy/sell/share-correction/cash-edit, each with a real date — see
   * lib/portfolio/history.ts's module doc comment for why this exists (the
   * old "Portfolio Value" chart had no real history to plot, only today's
   * blended totals, so it faked a straight-line ramp). Populated by
   * addHolding/sellHolding/updateHolding/updateCash below; never edited or
   * pruned directly. Defaults to `[]` for both brand-new portfolios and any
   * pre-existing saved portfolio from before this field existed — see
   * buildBootstrapTransactions in history.ts for how a holding/cash balance
   * with no matching ledger entries still gets a real, price-driven history
   * instead of silently showing $0.
   */
  transactions: PortfolioTransaction[];
}

const STORAGE_KEY = "finlens:portfolio";
/**
 * One-time forced-replacement marker (live report: "add to my portfolio",
 * pasted from a real trade-blotter screenshot) — bumping SEED_DATA alone
 * only affects a browser that has never saved anything to STORAGE_KEY yet
 * (see ensureHydrated below: `if (stored) data = stored`, unconditionally
 * preferring whatever's already saved). A browser that already visited
 * /portfolio once — even just to see the old illustrative AAPL/NVDA/MSFT
 * demo — would keep that stale saved data forever and never pick up these
 * real positions. Bumping this version string forces exactly one
 * SEED_DATA-wins reconciliation on the next load in every browser,
 * regardless of what's currently saved, then never fires again — so
 * whatever the user does afterward (add/remove holdings, edit cash) is
 * respected normally, same as before this mechanism existed.
 */
const SEED_VERSION_KEY = "finlens:portfolio:seedVersion";
const CURRENT_SEED_VERSION = "2026-07-28-real-positions";

/**
 * User's real portfolio, entered from their own trade-blotter screenshot
 * (Instrument / Qty / Trade Price) rather than a live brokerage
 * integration — Stox has no such integration, so this is the most
 * direct way to get real positions into the tracker. Replaces the old
 * illustrative AAPL/NVDA/MSFT demo seed.
 *
 * `purchasePrice` is the blotter's own "Trade Price" for each position.
 * `currentPrice` is deliberately seeded EQUAL to purchasePrice (0% unrealized
 * gain/loss) rather than a fabricated "current market price" — this app has
 * no live network access in the environment these figures were entered in,
 * so guessing a plausible-looking current price risks silently misstating
 * this user's real gain/loss. getFundamentals()'s sibling,
 * refreshLivePrices() (called on every /portfolio page mount — see
 * usePortfolio() below and app/(dashboard)/portfolio/page.tsx), overwrites
 * this with a real quote the moment it successfully reaches Yahoo, so this
 * placeholder only shows until that first live fetch resolves.
 * `dividendYieldPercent` uses each company's real, publicly published
 * trailing yield as a reasonable starting figure (not fabricated — same
 * approach as the illustrative-but-real figures in screener-data.ts);
 * `dividendsPaid` is left at 0 since there's no real receipt history
 * available to source it from, and 0 is an honest "not yet tracked" value
 * rather than a guessed one. Cash is left at 0/0 for the same reason — use
 * the Cash Balance card's edit button to set the real figure.
 */
const SEED_DATA: PortfolioData = {
  holdings: [
    { symbol: "MSFT", name: "Microsoft Corporation", currency: "USD", shares: 67, purchasePrice: 305.3788, currentPrice: 305.3788, changePercent: 0, dividendYieldPercent: 0.7, dividendsPaid: 0 },
    { symbol: "AMZN", name: "Amazon.com, Inc.", currency: "USD", shares: 99, purchasePrice: 106.6453, currentPrice: 106.6453, changePercent: 0, dividendYieldPercent: 0, dividendsPaid: 0 },
    { symbol: "GOOGL", name: "Alphabet Inc.", currency: "USD", shares: 54, purchasePrice: 139.5736, currentPrice: 139.5736, changePercent: 0, dividendYieldPercent: 0.4, dividendsPaid: 0 },
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", currency: "USD", shares: 15, purchasePrice: 438.9792, currentPrice: 438.9792, changePercent: 0, dividendYieldPercent: 1.2, dividendsPaid: 0 },
    { symbol: "AXP", name: "American Express Company", currency: "USD", shares: 33, purchasePrice: 145.8985, currentPrice: 145.8985, changePercent: 0, dividendYieldPercent: 1.0, dividendsPaid: 0 },
    { symbol: "CRM", name: "Salesforce, Inc.", currency: "USD", shares: 29, purchasePrice: 200.9221, currentPrice: 200.9221, changePercent: 0, dividendYieldPercent: 0.58, dividendsPaid: 0 },
    { symbol: "ASML", name: "ASML Holding N.V.", currency: "USD", shares: 3, purchasePrice: 672.5, currentPrice: 672.5, changePercent: 0, dividendYieldPercent: 0.8, dividendsPaid: 0 },
    { symbol: "SOFI", name: "SoFi Technologies, Inc.", currency: "USD", shares: 270, purchasePrice: 15.1278, currentPrice: 15.1278, changePercent: 0, dividendYieldPercent: 0, dividendsPaid: 0 },
    { symbol: "V", name: "Visa Inc.", currency: "USD", shares: 12, purchasePrice: 314.7162, currentPrice: 314.7162, changePercent: 0, dividendYieldPercent: 0.53, dividendsPaid: 0 },
    { symbol: "ANET", name: "Arista Networks, Inc.", currency: "USD", shares: 25, purchasePrice: 75.4948, currentPrice: 75.4948, changePercent: 0, dividendYieldPercent: 0, dividendsPaid: 0 },
    { symbol: "GBTC", name: "Grayscale Bitcoin Trust", currency: "USD", shares: 20, purchasePrice: 53.29, currentPrice: 53.29, changePercent: 0, dividendYieldPercent: 0, dividendsPaid: 0 },
  ],
  cash: { usd: 0, ils: 0 },
  // Deliberately empty — see the `transactions` field's doc comment on
  // PortfolioData. These 11 seeded positions have no real purchase dates
  // (they came from a one-time trade-blotter screenshot, not a dated
  // transaction log), so reconstructPortfolioHistory's bootstrap logic
  // treats all of them as a single as-of-range-start opening position
  // rather than this array claiming to know dates it doesn't.
  transactions: [],
};

const EMPTY_DATA: PortfolioData = { holdings: [], cash: { usd: 0, ils: 0 }, transactions: [] };

let data: PortfolioData = SEED_DATA;
let hydrated = false;
const listeners = new Set<() => void>();

function isHolding(value: unknown): value is PortfolioHolding {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.symbol === "string" &&
    typeof h.name === "string" &&
    typeof h.currency === "string" &&
    typeof h.shares === "number" &&
    typeof h.purchasePrice === "number" &&
    typeof h.currentPrice === "number" &&
    typeof h.changePercent === "number" &&
    typeof h.dividendYieldPercent === "number" &&
    typeof h.dividendsPaid === "number"
  );
}

function isTransaction(value: unknown): value is PortfolioTransaction {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.date === "string" &&
    (t.symbol === null || typeof t.symbol === "string") &&
    typeof t.sharesDelta === "number" &&
    typeof t.price === "number" &&
    (t.pool === "usd" || t.pool === "ils") &&
    typeof t.cashDelta === "number" &&
    typeof t.kind === "string"
  );
}

function readFromStorage(): PortfolioData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.filter(isHolding) : [];
    const cash =
      parsed.cash && typeof parsed.cash.usd === "number" && typeof parsed.cash.ils === "number"
        ? { usd: parsed.cash.usd, ils: parsed.cash.ils }
        : { usd: 0, ils: 0 };
    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions.filter(isTransaction) : [];
    return { holdings, cash, transactions };
  } catch {
    return null;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full/unavailable — in-memory state still works for this session.
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  // One-time forced reconciliation onto CURRENT_SEED_VERSION — see that
  // constant's doc comment. Runs before the normal stored-vs-seed check
  // below so it applies even to a browser with pre-existing saved data.
  let seedVersion: string | null = null;
  try {
    seedVersion = window.localStorage.getItem(SEED_VERSION_KEY);
  } catch {
    // Storage unavailable — fall through to the normal read path below;
    // this reconciliation just won't be able to run/persist this time.
  }
  if (seedVersion !== CURRENT_SEED_VERSION) {
    data = SEED_DATA;
    persist();
    try {
      window.localStorage.setItem(SEED_VERSION_KEY, CURRENT_SEED_VERSION);
    } catch {
      // Best-effort — worst case this reconciliation just runs again next load.
    }
    return;
  }

  const stored = readFromStorage();
  if (stored) {
    data = stored;
  } else {
    // First-ever visit (post-reconciliation): seed with the sample
    // portfolio and persist it so a reload doesn't re-seed on top of
    // anything the user has since deleted (e.g. a user who removes every
    // seeded holding should see a real empty state on their next visit,
    // not the seed data reappearing).
    data = SEED_DATA;
    persist();
  }
}

function notify() {
  for (const listener of listeners) listener();
}

/** Exported so the multi-user auth sync layer (lib/auth/AuthContext.tsx)
 * can observe every change and debounce-push it to the logged-in user's
 * server row, without addHolding/sellHolding/etc. needing to know auth
 * exists at all. */
export function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) {
      data = readFromStorage() ?? EMPTY_DATA;
      notify();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): PortfolioData {
  ensureHydrated();
  return data;
}

function getServerSnapshot(): PortfolioData {
  // Matches the very first client render before hydration reconciles against
  // localStorage — see lib/watchlist/store.ts's identical doc comment for
  // why useSyncExternalStore makes this safe rather than a hydration bug.
  return SEED_DATA;
}

/** Which PortfolioCash pool a holding's buy/sell cash flow settles into — TASE listings are tagged "ILA" (Israeli Agora, the currency code used across lib/finance) and settle in the ILS pool; everything else (USD and any other currency this app doesn't have a dedicated cash pool for) settles in the USD pool, matching the app's only two cash pools and USD's role as the default/base elsewhere (see computePortfolioTotals). */
function cashPoolForCurrency(currency: string): keyof PortfolioCash {
  return currency === "ILA" ? "ils" : "usd";
}

/**
 * Smart Buy Cash Integration (feature request: buying a position should
 * automatically deduct shares x purchasePrice from the Cash Balance,
 * rather than leaving Cash Balance and Holdings as two disconnected numbers
 * the user has to reconcile by hand). The incoming `holding`'s own
 * shares/purchasePrice represent THIS purchase transaction — even when
 * merging into an existing position below, so the cash deducted is always
 * exactly this transaction's cost, never the blended/total position's cost.
 * Clamped at 0 like updateCash (see that function's doc comment for why
 * this app doesn't model negative cash) rather than going negative — a
 * purchase that costs more than the recorded cash balance still records
 * the shares (this is a manual tracker, not an enforcing brokerage) but
 * zeroes the balance instead of showing a phantom negative figure.
 */
export function addHolding(holding: PortfolioHolding): void {
  ensureHydrated();
  const symbol = holding.symbol.toUpperCase();
  const cost = holding.shares * holding.purchasePrice;
  const pool = cashPoolForCurrency(holding.currency);
  const existing = data.holdings.find((h) => h.symbol === symbol);
  let holdings: PortfolioHolding[];
  if (existing) {
    // Adding more of a symbol you already hold: merge into a single
    // position with a blended (weighted-average) cost basis, same as any
    // real brokerage would show, rather than showing two confusing rows
    // for the same ticker.
    const totalShares = existing.shares + holding.shares;
    const blendedCost =
      (existing.shares * existing.purchasePrice + holding.shares * holding.purchasePrice) / totalShares;
    holdings = data.holdings.map((h) =>
      h.symbol === symbol
        ? {
            ...h,
            shares: totalShares,
            purchasePrice: Number(blendedCost.toFixed(4)),
            currentPrice: holding.currentPrice,
            changePercent: holding.changePercent,
          }
        : h
    );
  } else {
    holdings = [...data.holdings, { ...holding, symbol }];
  }
  const transaction = makeBuyTransaction(symbol, holding.shares, holding.purchasePrice, holding.currency);
  data = {
    ...data,
    holdings,
    cash: { ...data.cash, [pool]: Math.max(0, data.cash[pool] - cost) },
    transactions: [...data.transactions, transaction],
  };
  persist();
  notify();
}

export function removeHolding(symbolRaw: string): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  const existing = data.holdings.find((h) => h.symbol === symbol);
  const transactions = existing
    ? [...data.transactions, makeAdjustmentTransaction(symbol, -existing.shares, existing.purchasePrice, existing.currency)]
    : data.transactions;
  data = { ...data, holdings: data.holdings.filter((h) => h.symbol !== symbol), transactions };
  persist();
  notify();
}

/**
 * Smart Sell Cash Integration (feature request: selling/removing a
 * position should prompt for a sell price and automatically credit the
 * proceeds to Cash Balance). Supports a PARTIAL sell (sharesToSell less
 * than the full position) as well as a full sell/exit — a partial sell
 * reduces the holding's share count and leaves its cost-basis-per-share
 * (`purchasePrice`) untouched, since the remaining shares' original cost
 * basis hasn't changed; a full sell (sharesToSell >= the position's whole
 * share count) removes the holding entirely, same end state
 * removeHolding() alone would produce, just with the cash credit applied
 * first. `sharesToSell` is clamped to the position's actual share count so
 * a stale/rounded input can never sell more shares than are actually held.
 * No-ops (returns without touching state) on an unknown symbol or a
 * non-positive shares/price input, rather than silently crediting cash for
 * a phantom sale.
 */
export function sellHolding(symbolRaw: string, sharesToSell: number, sellPrice: number): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  const existing = data.holdings.find((h) => h.symbol === symbol);
  if (!existing || !(sharesToSell > 0) || !(sellPrice > 0)) return;
  const clampedShares = Math.min(sharesToSell, existing.shares);
  const proceeds = clampedShares * sellPrice;
  const pool = cashPoolForCurrency(existing.currency);
  const remainingShares = existing.shares - clampedShares;
  const transaction = makeSellTransaction(symbol, clampedShares, sellPrice, existing.currency);
  data = {
    ...data,
    cash: { ...data.cash, [pool]: data.cash[pool] + proceeds },
    holdings:
      remainingShares > 0
        ? data.holdings.map((h) => (h.symbol === symbol ? { ...h, shares: remainingShares } : h))
        : data.holdings.filter((h) => h.symbol !== symbol),
    transactions: [...data.transactions, transaction],
  };
  persist();
  notify();
}

/**
 * Edit Holdings feature (request: let a user correct/adjust an existing
 * position's shares or purchase price directly — e.g. fixing a typo'd
 * quantity or cost basis — as distinct from a Buy/Sell transaction, so it
 * deliberately does NOT touch Cash Balance the way addHolding/sellHolding
 * do). Either field can be edited independently; omitting one (or passing
 * a non-positive value, which isn't a valid share count or price) leaves
 * that field unchanged rather than zeroing it out.
 */
export function updateHolding(symbolRaw: string, patch: { shares?: number; purchasePrice?: number }): void {
  ensureHydrated();
  const symbol = symbolRaw.toUpperCase();
  const existing = data.holdings.find((h) => h.symbol === symbol);
  const nextShares = patch.shares != null && patch.shares > 0 ? patch.shares : existing?.shares;
  // Transaction-Aware Historical Portfolio Value fix: a share-count
  // correction changes what the ledger needs to reconcile to (see
  // buildBootstrapTransactions in history.ts), so it's logged as a
  // zero-cash "adjustment" entry — purchasePrice-only edits don't need one,
  // since reconstructPortfolioHistory prices every date by real historical
  // closes, never by a holding's stored purchasePrice/cost basis.
  const transactions =
    existing && nextShares != null && nextShares !== existing.shares
      ? [...data.transactions, makeAdjustmentTransaction(symbol, nextShares - existing.shares, patch.purchasePrice ?? existing.purchasePrice, existing.currency)]
      : data.transactions;
  data = {
    ...data,
    holdings: data.holdings.map((h) =>
      h.symbol === symbol
        ? {
            ...h,
            shares: patch.shares != null && patch.shares > 0 ? patch.shares : h.shares,
            purchasePrice: patch.purchasePrice != null && patch.purchasePrice > 0 ? patch.purchasePrice : h.purchasePrice,
          }
        : h
    ),
    transactions,
  };
  persist();
  notify();
}

/**
 * QA feature (live report: Cash Balance was read-only — no way to update
 * the USD/ILS figures short of clearing localStorage). Mirrors
 * addHolding/removeHolding's mutate-module-state-then-persist-then-notify
 * pattern exactly, so the Cash Balance card stays in sync with any other
 * open instance of usePortfolio() the same way holdings already do.
 * Negative values are clamped to 0 — a cash balance below zero isn't a
 * real state this app models (no margin/negative-cash concept anywhere
 * else in the portfolio math, see computePortfolioTotals).
 */
export function updateCash(next: PortfolioCash): void {
  ensureHydrated();
  const clamped = { usd: Math.max(0, next.usd), ils: Math.max(0, next.ils) };
  // Transaction-Aware Historical Portfolio Value fix: log the DELTA (not
  // the raw new totals) as a dated cash transaction for each pool that
  // actually changed, so a manual Cash Balance edit (deposit, withdrawal,
  // or correction) shows up in the ledger reconstruction at the date it
  // was made instead of silently being absorbed into the bootstrap gap.
  const usdDelta = clamped.usd - data.cash.usd;
  const ilsDelta = clamped.ils - data.cash.ils;
  const transactions = [
    ...data.transactions,
    ...(Math.abs(usdDelta) > 1e-9 ? [makeCashTransaction("usd", usdDelta)] : []),
    ...(Math.abs(ilsDelta) > 1e-9 ? [makeCashTransaction("ils", ilsDelta)] : []),
  ];
  data = { ...data, cash: clamped, transactions };
  persist();
  notify();
}

/**
 * Refreshes currentPrice/changePercent for every held symbol from the live
 * /api/quotes route (same endpoint the Watchlist page already uses) and
 * persists the result — so once a fetch succeeds, that live price is what
 * shows on future visits too, not just this session. Silently no-ops on
 * failure (network-blocked sandbox, rate limit, etc.) and leaves whatever
 * price — seeded or last-known-live — already on the holding.
 */
export async function refreshLivePrices(): Promise<void> {
  ensureHydrated();
  const symbols = data.holdings.map((h) => h.symbol);
  if (symbols.length === 0) return;
  try {
    // Mobile state-sync fix: cache: "no-store" on top of /api/quotes' own
    // no-store response header — never let a mobile browser (or a carrier
    // proxy) serve back a cached quote for this holding's price.
    const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    const quotes: { symbol: string; price: number | null; changePercent: number | null; currency: string }[] =
      body.quotes ?? [];
    if (quotes.length === 0) return;
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    data = {
      ...data,
      holdings: data.holdings.map((h) => {
        const q = bySymbol.get(h.symbol);
        if (!q || q.price == null) return h;
        return {
          ...h,
          currentPrice: toDisplayUnit(q.price, q.currency),
          changePercent: q.changePercent ?? h.changePercent,
        };
      }),
    };
    persist();
    notify();
  } catch {
    // Offline / blocked — keep showing the last-known price.
  }
}

/** Current in-memory portfolio, for the auth layer to read at signup-
 * migration time or before a debounced server push. */
export function getRawSnapshot(): PortfolioData {
  ensureHydrated();
  return data;
}

/** Multi-user data isolation: replaces the ENTIRE local portfolio (holdings
 * + cash) with the just-logged-in user's server-saved data, or a clean
 * empty portfolio if they've never saved one (deliberately NOT the
 * illustrative SEED_DATA demo — a real logged-in account with no saved
 * data should look like a genuinely empty portfolio, not someone else's
 * demo positions). Called right after a successful login. Sets `hydrated
 * = true` so the SEED_VERSION reconciliation in ensureHydrated (meant only
 * for a fresh anonymous browser) can't run afterward and clobber it. */
export function hydrateFromServer(next: unknown): void {
  const candidate = next && typeof next === "object" ? (next as Record<string, unknown>) : null;
  const holdings = candidate && Array.isArray(candidate.holdings) ? candidate.holdings.filter(isHolding) : [];
  const cashCandidate = candidate?.cash as Record<string, unknown> | undefined;
  const cash =
    cashCandidate && typeof cashCandidate.usd === "number" && typeof cashCandidate.ils === "number"
      ? { usd: cashCandidate.usd, ils: cashCandidate.ils }
      : { usd: 0, ils: 0 };
  const transactions = candidate && Array.isArray(candidate.transactions) ? candidate.transactions.filter(isTransaction) : [];
  data = candidate ? { holdings, cash, transactions } : EMPTY_DATA;
  hydrated = true;
  persist();
  notify();
}

/** Clears the portfolio back to empty — called on logout so the next
 * viewer (anonymous, or a different friend logging in before
 * hydrateFromServer runs) never sees the previous user's holdings/cash. */
export function resetToEmpty(): void {
  data = EMPTY_DATA;
  hydrated = true;
  persist();
  notify();
}

/** Live-updating portfolio state + mutators, safe to call from any client component. */
export function usePortfolio() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    holdings: snapshot.holdings,
    cash: snapshot.cash,
    transactions: snapshot.transactions,
    addHolding,
    removeHolding,
    updateCash,
    refreshLivePrices,
  };
}
