/**
 * Domain types for FinLens market data. Deliberately independent of the
 * yahoo-finance2 response shapes — lib/finance/yahoo.ts is the only file
 * that should import from "yahoo-finance2" and adapt into these types, so
 * swapping/adding a data provider later doesn't ripple through the UI.
 */

export type MarketState = "PRE" | "REGULAR" | "POST" | "POSTPOST" | "PREPRE" | "CLOSED";

export interface MarketQuote {
  symbol: string;
  /** Display name, e.g. "Apple Inc." or "S&P 500" */
  name: string;
  /** Exchange code, e.g. "NASDAQ", "NYSE", "TLV" */
  exchange: string;
  /** ISO-ish currency code as returned by the provider, e.g. USD, ILA, EUR */
  currency: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  marketState: MarketState | null;
  /** Epoch ms of the quote timestamp, if known */
  asOf: number | null;
  postMarketPrice: number | null;
  postMarketChange: number | null;
  postMarketChangePercent: number | null;
}

export interface SearchResultItem {
  symbol: string;
  name: string;
  exchange: string;
  /** Best-effort from exchange (search doesn't return currency); see lib/finance/exchange.ts */
  currency: string;
  /** EQUITY, ETF, INDEX, CRYPTOCURRENCY, MUTUALFUND, CURRENCY, ... */
  type: string;
}

export class MarketDataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MarketDataError";
  }
}
