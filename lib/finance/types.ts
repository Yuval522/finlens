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
  /** IANA timezone of the exchange, e.g. "America/New_York", "Asia/Jerusalem" */
  timezone: string | null;
  preMarketPrice: number | null;
  preMarketChange: number | null;
  preMarketChangePercent: number | null;
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

export interface CompanyProfile {
  sector: string | null;
  industry: string | null;
  website: string | null;
  ceo: string | null;
  description: string | null;
}

export interface FinancialsMetrics {
  marketCap: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  forwardPeg: number | null;
  priceToCashFlow: number | null;
}

export interface YieldsMetrics {
  /** Percent, e.g. 3.2 means 3.2% */
  earningsYield: number | null;
  cashFlowYield: number | null;
  freeCashFlowYield: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
}

export interface BalanceMetrics {
  totalCash: number | null;
  totalDebt: number | null;
  netCashPosition: number | null;
}

export interface MarginMetrics {
  /** Percent, e.g. 45.2 means 45.2% */
  grossMargin: number | null;
  operatingMargin: number | null;
  netIncomeMargin: number | null;
}

export interface TickerMetrics {
  financials: FinancialsMetrics;
  yields: YieldsMetrics;
  balances: BalanceMetrics;
  margins: MarginMetrics;
}

export interface IncomeStatementYear {
  fiscalYear: string;
  totalRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  sharesOutstandingDiluted: number;
  dividendsPerShare: number;
}

export interface BalanceSheetYear {
  fiscalYear: string;
  /** Cash & cash equivalents plus short-term marketable securities. */
  cashAndShortTermInvestments: number;
  totalCurrentLiabilities: number;
  totalAssets: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  /** Cash & cash equivalents only (subset of cashAndShortTermInvestments). */
  totalCash: number;
  totalDebt: number;
}

export interface PricePoint {
  /** ISO date, e.g. "2024-03-15" */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface FundamentalsBundle {
  quote: MarketQuote;
  profile: CompanyProfile;
  metrics: TickerMetrics;
  /** Most recent ~5 fiscal years, oldest first */
  income: IncomeStatementYear[];
  /** Most recent ~5 fiscal years, oldest first */
  balance: BalanceSheetYear[];
  /** Daily closes, oldest first — sliced client-side per selected time range */
  history: PricePoint[];
  /**
   * Currency for `metrics`/`income` figures. Usually equals quote.currency,
   * but diverges for dual-listed names like TEVA.TA, which trades in ILA
   * on the TASE but reports financial statements in USD.
   */
  reportingCurrency: string;
  source: "live" | "mock";
}

export class MarketDataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MarketDataError";
  }
}
