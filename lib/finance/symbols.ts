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
