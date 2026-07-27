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
  /**
   * Yahoo's instrument classification, e.g. "EQUITY", "INDEX", "ETF",
   * "CRYPTOCURRENCY". Optional (mock quotes omit it — they're all EQUITY)
   * and only really used to gate the fundamentals tab strip for indices,
   * which have no income statement/balance sheet/etc. to show. See
   * isIndexQuote() in lib/finance/exchange.ts.
   */
  quoteType?: string | null;
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
  priceToFreeCashFlow: number | null;
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

/**
 * Multi-source aggregation (see lib/finance/aggregate.ts): each historical
 * financial-statement year is fetched from whichever provider has it,
 * prioritized deepest/most-authoritative first. "sec-edgar" is the primary
 * deep-history source (audited XBRL data straight from 10-K/20-F filings,
 * typically 10+ years for any SEC-registered filer); "yahoo" covers recent
 * years and any ticker SEC doesn't register (foreign-only listings);
 * "fmp" is a third-tier fallback for whatever gap remains. Optional and
 * omitted on mock/demo data (see mock-data.ts) — a missing `dataSource`
 * should be read as "mock" whenever `FundamentalsBundle.source === "mock"`.
 */
export type FinancialDataSource = "sec-edgar" | "yahoo" | "fmp";

export interface IncomeStatementYear {
  fiscalYear: string;
  totalRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  sharesOutstandingDiluted: number;
  dividendsPerShare: number;
  dataSource?: FinancialDataSource;
}

export interface BalanceSheetYear {
  fiscalYear: string;
  /** Cash & cash equivalents plus short-term marketable securities. */
  cashAndShortTermInvestments: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalAssets: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  /** Cash & cash equivalents only (subset of cashAndShortTermInvestments). */
  totalCash: number;
  totalDebt: number;
  dataSource?: FinancialDataSource;
}

export interface CashFlowYear {
  fiscalYear: string;
  operatingCashFlow: number;
  freeCashFlow: number;
  /** Non-cash addback, reported as a positive figure (provider convention). */
  stockBasedCompensation: number;
  /** Investing outflow, reported as a negative figure (provider convention). */
  capitalExpenditures: number;
  /** Snapshot of net income for this fiscal year, for the OCF-vs-Net-Income
   *  earnings-quality comparison — duplicated here rather than joined
   *  against `income[]` at render time since the two arrays aren't
   *  guaranteed to cover identical fiscal years. */
  netIncome: number;
  dataSource?: FinancialDataSource;
}

export interface EstimateRow {
  /** Display label, e.g. "Sep 2025" (annual) or "2025 Q2" (quarterly). */
  fiscalPeriodLabel: string;
  /** ISO date of the fiscal period end, for sorting. */
  periodEndDate: string;
  revenueEstimate: number | null;
  revenueYoyGrowthPct: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  numberOfAnalysts: number | null;
  /** True once the fiscal period has actually closed. */
  isHistorical: boolean;
  /** Only meaningful when isHistorical — actual reported revenue met/beat consensus. */
  beat: boolean | null;
  /** Only populated when isHistorical and known. */
  actualRevenue: number | null;
  /**
   * Trailing EPS actual/estimate (Yahoo's `earningsHistory` module, up to
   * ~4 quarters back) — populated for historical quarterly rows that don't
   * have a revenue consensus to compare against (see beatBasis).
   */
  epsActual: number | null;
  epsEstimate: number | null;
  /**
   * Which figure `beat` is based on. Yahoo's free tier doesn't expose
   * point-in-time historical *revenue* consensus (only forward-looking
   * earningsTrend and trailing EPS-only earningsHistory), so live
   * historical rows are honestly labeled "eps" rather than fabricating a
   * revenue comparison. Mock/demo data uses "revenue" throughout. Null
   * when there's nothing to compare (forward-looking rows).
   */
  beatBasis: "revenue" | "eps" | null;
}

export interface EstimatesBundle {
  quarterly: EstimateRow[];
  annual: EstimateRow[];
}

/** Analyst rating counts for the most recent period Yahoo reports (its `recommendationTrend` module's first row, conventionally labeled "0m" — this month). */
export interface AnalystRecommendationDistribution {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/**
 * Analyst price-target consensus (Estimates tab). Sourced from Yahoo's
 * `financialData`/`recommendationTrend` quoteSummary modules — see
 * toPriceTargets() in yahoo.ts. Target prices are assumed to share the same
 * raw-unit convention as `quote.price` for that symbol (e.g. agorot for
 * ILA-quoted TASE names) — same unverified-in-this-sandbox caveat already
 * documented on toMetrics()/formatPrice(), so they're always rendered
 * through the same currency-aware formatter as the header price rather than
 * assumed to already be in display units.
 */
export interface AnalystPriceTargets {
  meanTarget: number | null;
  medianTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  numberOfAnalysts: number | null;
  /** Yahoo's 1 (Strong Buy) - 5 (Strong Sell) consensus scale. */
  recommendationMean: number | null;
  /** Yahoo's raw key, e.g. "buy", "strong_buy", "hold" — title-cased for display. */
  recommendationKey: string | null;
  distribution: AnalystRecommendationDistribution | null;
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
  /**
   * Annual, oldest first — depth varies by source (see aggregate.ts),
   * typically 10+ years for SEC-registered filers. May end with one
   * trailing-appendix row: `fiscalYear: "TTM"` (trailing twelve months) on
   * `income`/`cashFlow`, or `fiscalYear: "MRQ"` (most recent quarter) on
   * `balance` — see splitTrailingRow() in chart-transform.ts, which panels
   * use to pull it out before Select Range filtering and always re-append
   * it afterward, so it's never sliced away as one of the "N years".
   */
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  /**
   * Quarterly counterparts, `fiscalYear` holds a "YYYY-Qn" label (e.g.
   * "2025-Q2") instead of a bare year — see quarterLabel()/quarterlySeries()
   * in yahoo.ts / providers/sec-edgar.ts. Powers the Chart Type: Quarterly
   * toggle (ChartControls.tsx); may be empty (e.g. mock/demo data, or a
   * foreign private issuer with no 10-Q filings and thin Yahoo/FMP
   * quarterly coverage) — panels should treat an empty array as "Quarterly
   * unavailable for this symbol" rather than rendering an empty chart.
   */
  incomeQuarterly?: IncomeStatementYear[];
  balanceQuarterly?: BalanceSheetYear[];
  cashFlowQuarterly?: CashFlowYear[];
  estimates: EstimatesBundle;
  /** Null when the provider has no analyst coverage for this symbol (thin/illiquid names) or on mock data that doesn't define it. */
  priceTargets: AnalystPriceTargets | null;
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
