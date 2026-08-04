/**
 * Curated symbol lists. Yahoo Finance's screener endpoints are US-market
 * only, so TASE (Tel Aviv) "most active" coverage is seeded with a fixed
 * list of liquid, well-known large caps rather than a live screener.
 */

export const MARKET_SUMMARY_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^TA125.TA", label: "TA-125" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ Composite" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "BTC-USD", label: "Bitcoin USD" },
];

/** Seed list blended with the live US "most actives" screener. */
export const TASE_SEED_SYMBOLS: string[] = [
  "TEVA.TA", // Teva Pharmaceutical
  "ICL.TA", // ICL Group
  "NICE.TA", // NICE Ltd
  "ESLT.TA", // Elbit Systems
  "POLI.TA", // Bank Hapoalim
  "LUMI.TA", // Bank Leumi
];

/** Fallback US large caps if the live screener is unreachable. */
export const US_FALLBACK_SYMBOLS: string[] = [
  "AAPL",
  "NVDA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "TSLA",
];

/** The "Magnificent Seven" mega-cap tech names — Home page's Big 7 section. */
export const BIG_SEVEN_SYMBOLS: string[] = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
];

/**
 * Natural Language Strategy Builder's live screening universe (see
 * lib/strategy/execute.ts). A genuinely live, real-time screen across the
 * *entire* US market would mean quote-fetching thousands of tickers per
 * query — impractical for a single request/response cycle and well past
 * what Yahoo's free, unofficial endpoint should be asked to do in one
 * batch. This is a static, hand-curated list of ~180 well-known, liquid
 * large/mid-cap US names spanning every major GICS sector instead — real,
 * live quotes (see getQuotes() in yahoo.ts), just from a bounded, fixed
 * membership rather than a live index constituent feed. Two honest
 * limitations worth knowing: (1) it will drift out of date over time as
 * real index membership changes (additions, removals, M&A) — nothing here
 * auto-refreshes it; (2) a strategy that should genuinely match a stock
 * outside this list (a small-cap, a recent IPO, a non-US listing) simply
 * won't find it, no matter how well the natural-language parsing works.
 * The Strategy Builder UI surfaces the universe size next to results so
 * this scope is visible, not hidden.
 */
export const STRATEGY_UNIVERSE_SYMBOLS: string[] = [
  // Technology
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "CSCO", "ACN", "AMD", "INTC", "IBM", "TXN", "QCOM", "INTU", "NOW",
  "AMAT", "MU", "ADI", "LRCX", "KLAC", "SNPS", "CDNS", "PANW", "CRWD", "FTNT",
  "PLTR", "SHOP", "UBER", "ABNB", "SNOW", "NET", "DDOG", "ZS", "TEAM", "WDAY",
  "DELL", "HPQ", "HPE", "STX", "WDC", "MSI", "ANET", "APH", "TER", "KEYS",
  // Financials
  "BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "C",
  "SCHW", "BLK", "SPGI", "CB", "PGR", "MMC", "ICE", "CME", "AON", "USB",
  "PNC", "TFC", "COF", "BK", "AIG", "MET", "PRU", "TRV", "ALL", "AFL",
  // Healthcare
  "LLY", "UNH", "JNJ", "MRK", "ABBV", "TMO", "ABT", "PFE", "DHR", "AMGN",
  "ISRG", "BMY", "GILD", "VRTX", "CVS", "MDT", "CI", "ELV", "SYK", "REGN",
  "BSX", "ZTS", "HCA", "BDX", "IDXX", "MRNA", "IQV", "EW",
  // Consumer Discretionary / Staples
  "WMT", "HD", "COST", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG", "TGT",
  "PG", "KO", "PEP", "PM", "MDLZ", "CL", "MO", "KMB", "GIS", "STZ",
  "DIS", "CMCSA", "NFLX", "MAR", "CMG", "ORLY", "AZO", "YUM", "DPZ", "ROST",
  // Industrials
  "GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT", "UPS", "ADP",
  "ETN", "GD", "NOC", "ITW", "EMR", "CSX", "NSC", "WM", "FDX", "PH",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "WMB",
  // Materials / Utilities / Real Estate
  "LIN", "SHW", "APD", "ECL", "FCX", "NEM", "NEE", "DUK", "SO", "D",
  "AEP", "EXC", "PLD", "AMT", "EQIX", "PSA", "O", "SPG", "WELL", "DLR",
  // Communication Services
  "GOOG", "TMUS", "VZ", "T", "CHTR", "EA", "TTWO", "WBD", "PARA",
];
