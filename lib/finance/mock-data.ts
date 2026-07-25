import type { FundamentalsBundle, PricePoint } from "./types";

/**
 * Illustrative fallback data for AAPL, NVDA, and TEVA.TA.
 *
 * These figures are approximate, hand-authored ballparks (order-of-magnitude
 * realistic as of early 2026) — NOT live data, and not sourced from any
 * live API call in this environment. They exist purely so the ticker
 * analysis UI (charts, accordions, income statement bars) always has
 * something real-shaped to render when the live provider is unreachable,
 * which is guaranteed inside this sandbox (Yahoo Finance is blocked by the
 * egress proxy here — see project notes). getFundamentals() in yahoo.ts
 * only reaches for this data after a live attempt fails.
 */

// ---------------------------------------------------------------------------
// Deterministic synthetic price history (seeded — same output every render,
// so server- and client-rendered charts never mismatch).
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic geometric-random-walk price series ending near `endPrice` today. */
function generateSyntheticHistory(opts: {
  seed: string;
  years?: number;
  endPrice: number;
  annualDriftPct?: number;
  annualVolPct?: number;
}): PricePoint[] {
  const { seed, years = 10, endPrice, annualDriftPct = 14, annualVolPct = 32 } = opts;
  const rand = mulberry32(hashString(seed));
  const tradingDays = Math.round(years * 252);
  const dailyDrift = annualDriftPct / 100 / 252;
  const dailyVol = annualVolPct / 100 / Math.sqrt(252);

  // Walk backward from today's price so the series lands on a known value,
  // then reverse into chronological order.
  const closesDesc: number[] = [endPrice];
  for (let i = 1; i < tradingDays; i++) {
    const u1 = Math.max(rand(), 1e-6);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const step = dailyDrift - (dailyVol * dailyVol) / 2 + dailyVol * z;
    const prev = closesDesc[closesDesc.length - 1] / Math.exp(step);
    closesDesc.push(Math.max(prev, endPrice * 0.05));
  }
  const closes = closesDesc.reverse();

  const today = new Date();
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - years);

  const points: PricePoint[] = [];
  const cursor = new Date(start);
  let idx = 0;
  while (idx < closes.length && cursor <= today) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const close = closes[idx];
      const wiggle = close * 0.006;
      points.push({
        date: cursor.toISOString().slice(0, 10),
        open: Number((close - wiggle * 0.4).toFixed(2)),
        high: Number((close + wiggle).toFixed(2)),
        low: Number((close - wiggle).toFixed(2)),
        close: Number(close.toFixed(2)),
      });
      idx++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Curated per-symbol fundamentals
// ---------------------------------------------------------------------------

const MOCK_FUNDAMENTALS: Record<string, FundamentalsBundle> = {
  AAPL: {
    source: "mock",
    reportingCurrency: "USD",
    quote: {
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      currency: "USD",
      price: 196.42,
      change: 1.85,
      changePercent: 0.95,
      marketCap: 3_010_000_000_000,
      marketState: "REGULAR",
      asOf: Date.now(),
      timezone: "America/New_York",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: 196.9,
      postMarketChange: 0.48,
      postMarketChangePercent: 0.24,
    },
    profile: {
      sector: "Technology",
      industry: "Consumer Electronics",
      website: "https://www.apple.com",
      ceo: "Timothy D. Cook",
      description:
        "Apple designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories, and sells a range of related services.",
    },
    metrics: {
      financials: {
        marketCap: 3_010_000_000_000,
        peRatio: 30.1,
        forwardPE: 27.4,
        forwardPeg: 2.6,
        priceToCashFlow: 24.3,
      },
      yields: {
        earningsYield: 3.3,
        cashFlowYield: 4.1,
        freeCashFlowYield: 3.6,
        dividendYield: 0.5,
        payoutRatio: 15.2,
      },
      balances: {
        totalCash: 65_000_000_000,
        totalDebt: 105_000_000_000,
        netCashPosition: -40_000_000_000,
      },
      margins: {
        grossMargin: 46.2,
        operatingMargin: 30.7,
        netIncomeMargin: 25.3,
      },
    },
    income: [
      { fiscalYear: "2022", totalRevenue: 394_328_000_000, grossProfit: 170_782_000_000, operatingIncome: 119_437_000_000, netIncome: 99_803_000_000, eps: 6.11, sharesOutstandingDiluted: 16_326_000_000, dividendsPerShare: 0.9 },
      { fiscalYear: "2023", totalRevenue: 383_285_000_000, grossProfit: 169_148_000_000, operatingIncome: 114_301_000_000, netIncome: 96_995_000_000, eps: 6.13, sharesOutstandingDiluted: 15_812_000_000, dividendsPerShare: 0.94 },
      { fiscalYear: "2024", totalRevenue: 391_035_000_000, grossProfit: 180_683_000_000, operatingIncome: 123_216_000_000, netIncome: 93_736_000_000, eps: 6.08, sharesOutstandingDiluted: 15_408_000_000, dividendsPerShare: 0.97 },
      { fiscalYear: "2025", totalRevenue: 408_000_000_000, grossProfit: 189_000_000_000, operatingIncome: 129_000_000_000, netIncome: 101_000_000_000, eps: 6.72, sharesOutstandingDiluted: 15_030_000_000, dividendsPerShare: 1.0 },
      { fiscalYear: "TTM", totalRevenue: 416_500_000_000, grossProfit: 193_000_000_000, operatingIncome: 132_500_000_000, netIncome: 104_800_000_000, eps: 7.05, sharesOutstandingDiluted: 14_870_000_000, dividendsPerShare: 1.02 },
    ],
    history: generateSyntheticHistory({ seed: "AAPL", endPrice: 196.42, annualDriftPct: 18, annualVolPct: 28 }),
  },

  NVDA: {
    source: "mock",
    reportingCurrency: "USD",
    quote: {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      exchange: "NASDAQ",
      currency: "USD",
      price: 138.72,
      change: -2.14,
      changePercent: -1.52,
      marketCap: 3_390_000_000_000,
      marketState: "REGULAR",
      asOf: Date.now(),
      timezone: "America/New_York",
      preMarketPrice: 139.1,
      preMarketChange: 0.38,
      preMarketChangePercent: 0.27,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    },
    profile: {
      sector: "Technology",
      industry: "Semiconductors",
      website: "https://www.nvidia.com",
      ceo: "Jensen Huang",
      description:
        "NVIDIA designs graphics processing units (GPUs) for gaming and professional markets, as well as system-on-chip units and AI/data-center compute platforms.",
    },
    metrics: {
      financials: {
        marketCap: 3_390_000_000_000,
        peRatio: 52.8,
        forwardPE: 38.9,
        forwardPeg: 1.6,
        priceToCashFlow: 46.1,
      },
      yields: {
        earningsYield: 1.9,
        cashFlowYield: 2.2,
        freeCashFlowYield: 2.0,
        dividendYield: 0.03,
        payoutRatio: 1.4,
      },
      balances: {
        totalCash: 43_000_000_000,
        totalDebt: 10_500_000_000,
        netCashPosition: 32_500_000_000,
      },
      margins: {
        grossMargin: 74.8,
        operatingMargin: 61.5,
        netIncomeMargin: 54.9,
      },
    },
    income: [
      { fiscalYear: "2022", totalRevenue: 26_914_000_000, grossProfit: 17_475_000_000, operatingIncome: 10_041_000_000, netIncome: 9_752_000_000, eps: 0.39, sharesOutstandingDiluted: 25_070_000_000, dividendsPerShare: 0.04 },
      { fiscalYear: "2023", totalRevenue: 26_974_000_000, grossProfit: 15_356_000_000, operatingIncome: 5_577_000_000, netIncome: 4_368_000_000, eps: 0.17, sharesOutstandingDiluted: 24_940_000_000, dividendsPerShare: 0.04 },
      { fiscalYear: "2024", totalRevenue: 60_922_000_000, grossProfit: 44_301_000_000, operatingIncome: 32_972_000_000, netIncome: 29_760_000_000, eps: 1.19, sharesOutstandingDiluted: 24_940_000_000, dividendsPerShare: 0.04 },
      { fiscalYear: "2025", totalRevenue: 130_500_000_000, grossProfit: 97_800_000_000, operatingIncome: 81_500_000_000, netIncome: 72_900_000_000, eps: 2.94, sharesOutstandingDiluted: 24_800_000_000, dividendsPerShare: 0.04 },
      { fiscalYear: "TTM", totalRevenue: 165_000_000_000, grossProfit: 123_400_000_000, operatingIncome: 101_500_000_000, netIncome: 90_600_000_000, eps: 3.69, sharesOutstandingDiluted: 24_600_000_000, dividendsPerShare: 0.04 },
    ],
    history: generateSyntheticHistory({ seed: "NVDA", endPrice: 138.72, annualDriftPct: 45, annualVolPct: 52 }),
  },

  "TEVA.TA": {
    source: "mock",
    // Teva trades on the TASE in agorot but reports financial statements in USD.
    reportingCurrency: "USD",
    quote: {
      symbol: "TEVA.TA",
      name: "Teva Pharmaceutical Industries Ltd.",
      exchange: "TLV",
      currency: "ILA",
      price: 6820, // agorot -> ₪68.20
      change: 45,
      changePercent: 0.66,
      marketCap: 6_000_000_000_00, // agorot-scaled -> ₪60.00B
      marketState: "REGULAR",
      asOf: Date.now(),
      timezone: "Asia/Jerusalem",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    },
    profile: {
      sector: "Healthcare",
      industry: "Drug Manufacturers — Specialty & Generic",
      website: "https://www.tevapharm.com",
      ceo: "Richard Francis",
      description:
        "Teva Pharmaceutical Industries develops, manufactures, and markets generic and specialty medicines, including a large branded and generic drug portfolio worldwide.",
    },
    metrics: {
      financials: {
        marketCap: 16_800_000_000, // USD-equivalent, illustrative
        peRatio: 17.6,
        forwardPE: 10.9,
        forwardPeg: 1.3,
        priceToCashFlow: 8.7,
      },
      yields: {
        earningsYield: 5.7,
        cashFlowYield: 11.5,
        freeCashFlowYield: 8.9,
        dividendYield: 0,
        payoutRatio: 0,
      },
      balances: {
        totalCash: 2_400_000_000,
        totalDebt: 16_100_000_000,
        netCashPosition: -13_700_000_000,
      },
      margins: {
        grossMargin: 53.4,
        operatingMargin: 19.8,
        netIncomeMargin: 8.1,
      },
    },
    income: [
      { fiscalYear: "2021", totalRevenue: 16_112_000_000, grossProfit: 8_150_000_000, operatingIncome: 2_580_000_000, netIncome: 458_000_000, eps: 0.41, sharesOutstandingDiluted: 1_130_000_000, dividendsPerShare: 0 },
      { fiscalYear: "2022", totalRevenue: 14_859_000_000, grossProfit: 7_680_000_000, operatingIncome: 2_120_000_000, netIncome: 736_000_000, eps: 0.66, sharesOutstandingDiluted: 1_125_000_000, dividendsPerShare: 0 },
      { fiscalYear: "2023", totalRevenue: 15_838_000_000, grossProfit: 8_290_000_000, operatingIncome: 2_640_000_000, netIncome: 320_000_000, eps: 0.29, sharesOutstandingDiluted: 1_128_000_000, dividendsPerShare: 0 },
      { fiscalYear: "2024", totalRevenue: 16_500_000_000, grossProfit: 8_770_000_000, operatingIncome: 3_150_000_000, netIncome: 890_000_000, eps: 0.79, sharesOutstandingDiluted: 1_131_000_000, dividendsPerShare: 0 },
      { fiscalYear: "TTM", totalRevenue: 16_950_000_000, grossProfit: 9_050_000_000, operatingIncome: 3_360_000_000, netIncome: 955_000_000, eps: 0.85, sharesOutstandingDiluted: 1_132_000_000, dividendsPerShare: 0 },
    ],
    history: generateSyntheticHistory({ seed: "TEVA.TA", endPrice: 68.2, annualDriftPct: 6, annualVolPct: 38 }).map(
      (p) => ({
        // Re-scale the (₪-denominated) synthetic walk into raw agorot, to
        // match how the live price field is stored for this symbol.
        date: p.date,
        open: Math.round(p.open * 100),
        high: Math.round(p.high * 100),
        low: Math.round(p.low * 100),
        close: Math.round(p.close * 100),
      })
    ),
  },
};

export function getMockFundamentals(symbol: string): FundamentalsBundle | null {
  return MOCK_FUNDAMENTALS[symbol.toUpperCase()] ?? null;
}
