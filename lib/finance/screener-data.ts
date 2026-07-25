/**
 * Screener universe — illustrative, hand-authored figures (order-of-
 * magnitude realistic as of early 2026), NOT live data. Same "clearly
 * documented mock" approach as mock-data.ts: there's no live screener API
 * wired up (Yahoo/FMP screener endpoints need a paid tier or are blocked in
 * this sandbox), so this gives the /screener page a real-shaped universe of
 * well-known, real tickers to filter/sort against instead of shipping an
 * empty page. Swapping this for a live screener endpoint later only touches
 * this one file — the page component itself just consumes ScreenerStock[].
 */

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  marketCapB: number; // in billions USD
  peRatio: number | null;
  dividendYieldPercent: number;
}

export const SCREENER_SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Industrials",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export const SCREENER_UNIVERSE: ScreenerStock[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics", price: 333.02, changePercent: 3.53, marketCapB: 4890, peRatio: 40.32, dividendYieldPercent: 0.42 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", industry: "Software", price: 512.18, changePercent: 1.12, marketCapB: 3810, peRatio: 36.1, dividendYieldPercent: 0.68 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology", industry: "Semiconductors", price: 188.44, changePercent: 4.21, marketCapB: 4600, peRatio: 54.8, dividendYieldPercent: 0.03 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", industry: "Internet Content & Information", price: 231.6, changePercent: -0.85, marketCapB: 2870, peRatio: 27.4, dividendYieldPercent: 0.4 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary", industry: "Internet Retail", price: 244.9, changePercent: 0.63, marketCapB: 2560, peRatio: 42.7, dividendYieldPercent: 0 },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Communication Services", industry: "Internet Content & Information", price: 692.35, changePercent: 2.04, marketCapB: 1750, peRatio: 26.9, dividendYieldPercent: 0.31 },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Discretionary", industry: "Auto Manufacturers", price: 298.77, changePercent: -2.14, marketCapB: 960, peRatio: 118.3, dividendYieldPercent: 0 },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Technology", industry: "Semiconductors", price: 342.5, changePercent: 1.87, marketCapB: 1620, peRatio: 45.2, dividendYieldPercent: 0.85 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", industry: "Banks", price: 289.14, changePercent: 0.44, marketCapB: 820, peRatio: 14.2, dividendYieldPercent: 1.95 },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", industry: "Credit Services", price: 356.2, changePercent: 0.29, marketCapB: 690, peRatio: 31.5, dividendYieldPercent: 0.68 },
  { symbol: "MA", name: "Mastercard Inc.", sector: "Financials", industry: "Credit Services", price: 574.8, changePercent: 0.51, marketCapB: 520, peRatio: 34.1, dividendYieldPercent: 0.53 },
  { symbol: "UNH", name: "UnitedHealth Group Inc.", sector: "Healthcare", industry: "Healthcare Plans", price: 342.6, changePercent: -1.32, marketCapB: 315, peRatio: 16.8, dividendYieldPercent: 2.75 },
  { symbol: "LLY", name: "Eli Lilly & Co.", sector: "Healthcare", industry: "Drug Manufacturers", price: 912.4, changePercent: 1.94, marketCapB: 865, peRatio: 58.3, dividendYieldPercent: 0.7 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", industry: "Drug Manufacturers", price: 178.9, changePercent: 0.18, marketCapB: 430, peRatio: 17.6, dividendYieldPercent: 2.95 },
  { symbol: "XOM", name: "Exxon Mobil Corp.", sector: "Energy", industry: "Oil & Gas Integrated", price: 121.3, changePercent: -0.62, marketCapB: 510, peRatio: 13.9, dividendYieldPercent: 3.35 },
  { symbol: "CVX", name: "Chevron Corp.", sector: "Energy", industry: "Oil & Gas Integrated", price: 168.5, changePercent: -0.41, marketCapB: 315, peRatio: 15.1, dividendYieldPercent: 3.78 },
  { symbol: "PG", name: "Procter & Gamble Co.", sector: "Consumer Staples", industry: "Household Products", price: 172.4, changePercent: 0.22, marketCapB: 405, peRatio: 25.4, dividendYieldPercent: 2.31 },
  { symbol: "KO", name: "Coca-Cola Co.", sector: "Consumer Staples", industry: "Beverages", price: 71.2, changePercent: 0.15, marketCapB: 308, peRatio: 24.8, dividendYieldPercent: 2.88 },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", industry: "Discount Stores", price: 98.6, changePercent: 0.74, marketCapB: 795, peRatio: 39.2, dividendYieldPercent: 0.98 },
  { symbol: "COST", name: "Costco Wholesale Corp.", sector: "Consumer Staples", industry: "Discount Stores", price: 985.3, changePercent: 0.58, marketCapB: 437, peRatio: 52.6, dividendYieldPercent: 0.51 },
  { symbol: "HD", name: "Home Depot Inc.", sector: "Consumer Discretionary", industry: "Home Improvement Retail", price: 412.8, changePercent: -0.35, marketCapB: 410, peRatio: 26.3, dividendYieldPercent: 2.15 },
  { symbol: "DIS", name: "Walt Disney Co.", sector: "Communication Services", industry: "Entertainment", price: 118.7, changePercent: 1.05, marketCapB: 214, peRatio: 21.9, dividendYieldPercent: 0.95 },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Communication Services", industry: "Entertainment", price: 1142.5, changePercent: 2.68, marketCapB: 490, peRatio: 47.3, dividendYieldPercent: 0 },
  { symbol: "BA", name: "Boeing Co.", sector: "Industrials", industry: "Aerospace & Defense", price: 218.4, changePercent: -1.78, marketCapB: 165, peRatio: null, dividendYieldPercent: 0 },
  { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrials", industry: "Farm & Heavy Machinery", price: 452.9, changePercent: 0.87, marketCapB: 225, peRatio: 22.1, dividendYieldPercent: 1.42 },
  { symbol: "GE", name: "GE Aerospace", sector: "Industrials", industry: "Aerospace & Defense", price: 268.3, changePercent: 1.15, marketCapB: 295, peRatio: 44.6, dividendYieldPercent: 0.55 },
  { symbol: "NEE", name: "NextEra Energy Inc.", sector: "Utilities", industry: "Utilities - Regulated Electric", price: 78.9, changePercent: 0.12, marketCapB: 162, peRatio: 20.7, dividendYieldPercent: 3.05 },
  { symbol: "DUK", name: "Duke Energy Corp.", sector: "Utilities", industry: "Utilities - Regulated Electric", price: 121.6, changePercent: -0.08, marketCapB: 94, peRatio: 19.4, dividendYieldPercent: 3.62 },
  { symbol: "PLD", name: "Prologis Inc.", sector: "Real Estate", industry: "REIT - Industrial", price: 118.2, changePercent: 0.34, marketCapB: 110, peRatio: 33.8, dividendYieldPercent: 3.41 },
  { symbol: "AMT", name: "American Tower Corp.", sector: "Real Estate", industry: "REIT - Specialty", price: 214.5, changePercent: -0.21, marketCapB: 100, peRatio: 41.2, dividendYieldPercent: 3.02 },
  { symbol: "INTC", name: "Intel Corp.", sector: "Technology", industry: "Semiconductors", price: 34.6, changePercent: -3.12, marketCapB: 148, peRatio: null, dividendYieldPercent: 0 },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Technology", industry: "Semiconductors", price: 214.9, changePercent: 3.44, marketCapB: 348, peRatio: 89.6, dividendYieldPercent: 0 },
  { symbol: "CRM", name: "Salesforce Inc.", sector: "Technology", industry: "Software", price: 342.1, changePercent: 0.92, marketCapB: 330, peRatio: 48.5, dividendYieldPercent: 0.58 },
  { symbol: "ORCL", name: "Oracle Corp.", sector: "Technology", industry: "Software", price: 198.4, changePercent: 1.63, marketCapB: 555, peRatio: 41.9, dividendYieldPercent: 0.85 },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Healthcare", industry: "Drug Manufacturers", price: 26.8, changePercent: -0.55, marketCapB: 152, peRatio: 13.2, dividendYieldPercent: 6.05 },
  { symbol: "BAC", name: "Bank of America Corp.", sector: "Financials", industry: "Banks", price: 48.3, changePercent: 0.62, marketCapB: 368, peRatio: 13.6, dividendYieldPercent: 2.28 },
  { symbol: "TEVA.TA", name: "Teva Pharmaceutical", sector: "Healthcare", industry: "Drug Manufacturers - Specialty", price: 61.4, changePercent: 1.28, marketCapB: 53, peRatio: 19.4, dividendYieldPercent: 0 },
  { symbol: "NICE.TA", name: "NICE Ltd.", sector: "Technology", industry: "Software", price: 187.2, changePercent: -0.44, marketCapB: 12, peRatio: 22.8, dividendYieldPercent: 0 },
];
