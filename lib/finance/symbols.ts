/**
 * Curated symbol lists. Yahoo Finance's screener endpoints are US-market
 * only, so TASE (Tel Aviv) "most active" coverage is seeded with a fixed
 * list of liquid, well-known large caps rather than a live screener.
 */

// Apple-HIG concept redesign (see stox-redesign-concept.html's INDICES
// list): Home dashboard's Market Summary card grid. Bitcoin USD was
// dropped in an earlier pass (it's a crypto asset, not an index) but
// brought back per follow-up feedback — the section is now a horizontally
// scrollable row (see MarketSummarySection.tsx) rather than a fixed grid,
// so there's no fixed slot count forcing a choice between the two. Widened
// further per follow-up feedback (2026-08-19) to cover more of the globe's
// major markets, not just US + TASE — Russell 2000 (US small-cap), FTSE
// 100 (UK), Nikkei 225 (Japan), and Ethereum alongside Bitcoin. This
// constant has exactly one call site (getMarketSummary() below), so
// editing it here doesn't affect any other section — keep
// MARKET_SUMMARY_SLOTS in MarketSummaryGrid.tsx (the loading skeleton) in
// sync with this list's length so the skeleton-to-loaded swap doesn't
// reflow.
export const MARKET_SUMMARY_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^TA125.TA", label: "TA-125" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "ETH-USD", label: "Ethereum" },
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
 * batch. This is a static, hand-curated list of major S&P 500 / NASDAQ-100
 * large/mid-cap US names spanning every major GICS sector instead — real,
 * live quotes (see getStrategyQuotes() in yahoo.ts, which chunks requests
 * this size into safe batches), just from a bounded, fixed membership
 * rather than a live index constituent feed. Two honest limitations worth
 * knowing: (1) it will drift out of date over time as real index
 * membership changes (additions, removals, M&A, ticker changes — e.g.
 * Block Inc's SQ -> XYZ) — nothing here auto-refreshes it; (2) a strategy
 * that should genuinely match a stock outside this list (a small-cap, a
 * recent IPO, a non-US listing) simply won't find it, no matter how well
 * the natural-language parsing works. The Strategy Builder UI surfaces the
 * universe size next to results so this scope is visible, not hidden.
 *
 * Sized deliberately: precomputed by the refresh cron
 * (lib/strategy/universe-refresh.ts) rather than fetched live on every
 * request, so growing this list trades a larger/slower background refresh
 * (self-healing across successive daily runs — see that module's doc
 * comment) for richer, more accurate screening results and fewer
 * relaxed/near-miss fallbacks (lib/strategy/execute.ts's
 * findClosestMatches) on queries with several combined filters.
 */
export const STRATEGY_UNIVERSE_SYMBOLS: string[] = [
  // Technology — hardware, semis, software, internet, fintech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "CSCO", "ACN", "AMD", "INTC", "IBM", "TXN", "QCOM", "INTU", "NOW",
  "AMAT", "MU", "ADI", "LRCX", "KLAC", "SNPS", "CDNS", "PANW", "CRWD", "FTNT",
  "PLTR", "SHOP", "UBER", "ABNB", "SNOW", "NET", "DDOG", "ZS", "TEAM", "WDAY",
  "DELL", "HPQ", "HPE", "STX", "WDC", "MSI", "ANET", "APH", "TER", "KEYS",
  "TSM", "ASML", "ARM", "MRVL", "ON", "MCHP", "SWKS", "QRVO", "NXPI", "MPWR",
  "ENTG", "ONTO", "COHR", "GRMN", "FSLR", "ENPH", "CDW", "GLW", "JNPR", "FFIV",
  "AKAM", "PTC", "ANSS", "ADSK", "ROP", "TYL", "GDDY", "PAYC", "PAYX", "FI",
  "GPN", "JBL", "TDY", "ZBRA", "TRMB", "EPAM", "MDB", "HUBS", "OKTA", "TWLO",
  "DOCU", "ZM", "PINS", "SNAP", "RBLX", "U", "DASH", "BILL", "VEEV", "TTD",
  "APP", "CFLT", "ESTC", "GTLB", "S", "CYBR", "TENB", "QLYS", "RIVN", "LCID",
  "PYPL", "XYZ", "COIN", "AFRM", "UPST", "SOFI", "TOST", "FOUR",
  // Financials — banks, insurers, asset managers, exchanges, payments
  "BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "C",
  "SCHW", "BLK", "SPGI", "CB", "PGR", "MMC", "ICE", "CME", "AON", "USB",
  "PNC", "TFC", "COF", "BK", "AIG", "MET", "PRU", "TRV", "ALL", "AFL",
  "MCO", "NDAQ", "CBOE", "TROW", "STT", "NTRS", "CINF", "HIG", "WTW", "AJG",
  "ALLY", "DFS", "SYF", "RJF", "IVZ", "BEN", "FITB", "HBAN", "RF", "KEY",
  "CFG", "MTB", "ZION", "CMA", "WBS", "MKTX", "MSCI",
  // Healthcare — pharma, biotech, devices, services, distributors
  "LLY", "UNH", "JNJ", "MRK", "ABBV", "TMO", "ABT", "PFE", "DHR", "AMGN",
  "ISRG", "BMY", "GILD", "VRTX", "CVS", "MDT", "CI", "ELV", "SYK", "REGN",
  "BSX", "ZTS", "HCA", "BDX", "IDXX", "MRNA", "IQV", "EW",
  "CNC", "HUM", "MOH", "UHS", "DXCM", "ALGN", "A", "WAT", "RMD", "ILMN",
  "BAX", "ZBH", "HOLX", "COO", "STE", "MTD", "VTRS", "BIIB", "INCY", "ALNY",
  "SRPT", "EXAS", "TECH", "PODD", "GEHC", "CAH", "MCK", "COR", "DGX", "LH",
  "CRL", "WST",
  // Consumer Discretionary / Staples — retail, restaurants, autos, homebuilders, travel
  "WMT", "HD", "COST", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG", "TGT",
  "PG", "KO", "PEP", "PM", "MDLZ", "CL", "MO", "KMB", "GIS", "STZ",
  "DIS", "CMCSA", "NFLX", "MAR", "CMG", "ORLY", "AZO", "YUM", "DPZ", "ROST",
  "LULU", "DHI", "LEN", "NVR", "PHM", "GM", "F", "APTV", "BBY", "ULTA",
  "TSCO", "DG", "DLTR", "KR", "SYY", "ADM", "HSY", "KDP", "KHC", "CLX",
  "CHD", "EL", "KMX", "EXPE", "LVS", "WYNN", "MGM", "RCL", "CCL", "NCLH",
  "HLT", "DRI", "WBA",
  // Industrials — aerospace, machinery, transports, building products
  "GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT", "UPS", "ADP",
  "ETN", "GD", "NOC", "ITW", "EMR", "CSX", "NSC", "WM", "FDX", "PH",
  "MMM", "LHX", "TDG", "CARR", "OTIS", "IR", "ROK", "DOV", "XYL", "AME",
  "PCAR", "CMI", "PWR", "JCI", "SWK", "MAS", "ALLE", "FAST", "GWW", "URI",
  "CTAS", "VRSK", "IEX", "ROL", "PNR", "HII", "LDOS", "TXT", "WAB", "CHRW",
  "ODFL", "JBHT", "EXPD", "NDSN",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "WMB",
  "KMI", "OKE", "BKR", "HAL", "FANG", "DVN", "HES", "CTRA", "MRO", "APA",
  "EQT", "TRGP", "LNG",
  // Materials / Utilities / Real Estate
  "LIN", "SHW", "APD", "ECL", "FCX", "NEM", "NEE", "DUK", "SO", "D",
  "AEP", "EXC", "PLD", "AMT", "EQIX", "PSA", "O", "SPG", "WELL", "DLR",
  "DOW", "DD", "PPG", "NUE", "STLD", "VMC", "MLM", "IFF", "ALB", "CTVA",
  "MOS", "CF", "PKG", "IP", "AVY", "BALL", "PEG", "SRE", "XEL", "ED",
  "EIX", "WEC", "ES", "FE", "AEE", "CMS", "DTE", "ATO", "NI", "LNT",
  "PPL", "PNW", "CNP", "AWK", "ETR", "CCI", "SBAC", "VICI", "IRM", "AVB",
  "EQR", "ESS", "MAA", "UDR", "EXR", "CPT", "ARE", "BXP", "KIM", "REG",
  "FRT", "HST", "INVH",
  // Communication Services
  "GOOG", "TMUS", "VZ", "T", "CHTR", "EA", "TTWO", "WBD", "PARA",
  "LYV", "MTCH", "IPG", "OMC", "FOXA", "NWSA",
];
