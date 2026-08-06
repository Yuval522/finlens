import type { FundamentalsBundle, PricePoint } from "./types";
import { backfillCashFlowRevenue } from "./aggregate";

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
      preMarketTime: null,
      postMarketPrice: 196.9,
      postMarketChange: 0.48,
      postMarketChangePercent: 0.24,
      postMarketTime: Date.now(),
      dayOpen: 194.85,
      dayHigh: 197.1,
      dayLow: 194.2,
      previousClose: 194.57,
      firstTradeDateEpochMs: null,
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
        priceToFreeCashFlow: 27.9,
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
    balance: [
      { fiscalYear: "2022", totalAssets: 352_755_000_000, totalLiabilities: 302_083_000_000, totalStockholdersEquity: 50_672_000_000, cashAndShortTermInvestments: 48_304_000_000, totalCurrentAssets: 135_405_000_000, totalCurrentLiabilities: 153_982_000_000, totalCash: 23_646_000_000, totalDebt: 120_069_000_000 },
      { fiscalYear: "2023", totalAssets: 352_583_000_000, totalLiabilities: 290_437_000_000, totalStockholdersEquity: 62_146_000_000, cashAndShortTermInvestments: 61_555_000_000, totalCurrentAssets: 143_566_000_000, totalCurrentLiabilities: 145_308_000_000, totalCash: 29_965_000_000, totalDebt: 111_088_000_000 },
      { fiscalYear: "2024", totalAssets: 364_980_000_000, totalLiabilities: 308_030_000_000, totalStockholdersEquity: 56_950_000_000, cashAndShortTermInvestments: 65_171_000_000, totalCurrentAssets: 152_987_000_000, totalCurrentLiabilities: 176_392_000_000, totalCash: 29_943_000_000, totalDebt: 106_629_000_000 },
      { fiscalYear: "2025", totalAssets: 378_000_000_000, totalLiabilities: 315_000_000_000, totalStockholdersEquity: 63_000_000_000, cashAndShortTermInvestments: 68_000_000_000, totalCurrentAssets: 158_000_000_000, totalCurrentLiabilities: 180_000_000_000, totalCash: 32_000_000_000, totalDebt: 108_000_000_000 },
      { fiscalYear: "TTM", totalAssets: 382_000_000_000, totalLiabilities: 317_000_000_000, totalStockholdersEquity: 65_000_000_000, cashAndShortTermInvestments: 70_000_000_000, totalCurrentAssets: 162_000_000_000, totalCurrentLiabilities: 182_000_000_000, totalCash: 65_000_000_000, totalDebt: 105_000_000_000 },
    ],
    cashFlow: [
      { fiscalYear: "2022", operatingCashFlow: 122_151_000_000, freeCashFlow: 111_443_000_000, stockBasedCompensation: 9_038_000_000, capitalExpenditures: -10_708_000_000, netIncome: 99_803_000_000 },
      { fiscalYear: "2023", operatingCashFlow: 110_543_000_000, freeCashFlow: 99_584_000_000, stockBasedCompensation: 10_833_000_000, capitalExpenditures: -10_959_000_000, netIncome: 96_995_000_000 },
      { fiscalYear: "2024", operatingCashFlow: 118_254_000_000, freeCashFlow: 108_807_000_000, stockBasedCompensation: 11_688_000_000, capitalExpenditures: -9_447_000_000, netIncome: 93_736_000_000 },
      { fiscalYear: "2025", operatingCashFlow: 126_000_000_000, freeCashFlow: 115_800_000_000, stockBasedCompensation: 12_400_000_000, capitalExpenditures: -10_200_000_000, netIncome: 101_000_000_000 },
      { fiscalYear: "TTM", operatingCashFlow: 130_000_000_000, freeCashFlow: 119_500_000_000, stockBasedCompensation: 12_900_000_000, capitalExpenditures: -10_500_000_000, netIncome: 104_800_000_000 },
    ],
    estimates: {
      quarterly: [
        { fiscalPeriodLabel: "Jun 2025", periodEndDate: "2025-06-28", revenueEstimate: 89_500_000_000, revenueYoyGrowthPct: 8.5, revenueAvg: 89_500_000_000, revenueLow: 86_200_000_000, revenueHigh: 92_100_000_000, numberOfAnalysts: 28, isHistorical: true, beat: true, actualRevenue: 91_200_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Sep 2025", periodEndDate: "2025-09-27", revenueEstimate: 102_000_000_000, revenueYoyGrowthPct: 7.9, revenueAvg: 102_000_000_000, revenueLow: 98_500_000_000, revenueHigh: 105_800_000_000, numberOfAnalysts: 30, isHistorical: true, beat: true, actualRevenue: 106_000_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Dec 2025", periodEndDate: "2025-12-27", revenueEstimate: 137_000_000_000, revenueYoyGrowthPct: 6.4, revenueAvg: 137_000_000_000, revenueLow: 130_500_000_000, revenueHigh: 142_800_000_000, numberOfAnalysts: 31, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Mar 2026", periodEndDate: "2026-03-28", revenueEstimate: 96_500_000_000, revenueYoyGrowthPct: 5.8, revenueAvg: 96_500_000_000, revenueLow: 91_000_000_000, revenueHigh: 101_200_000_000, numberOfAnalysts: 27, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
      annual: [
        { fiscalPeriodLabel: "Sep 2024", periodEndDate: "2024-09-28", revenueEstimate: 390_000_000_000, revenueYoyGrowthPct: 1.8, revenueAvg: 390_000_000_000, revenueLow: 384_000_000_000, revenueHigh: 396_500_000_000, numberOfAnalysts: 34, isHistorical: true, beat: true, actualRevenue: 391_035_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Sep 2025", periodEndDate: "2025-09-27", revenueEstimate: 405_000_000_000, revenueYoyGrowthPct: 4.3, revenueAvg: 405_000_000_000, revenueLow: 397_000_000_000, revenueHigh: 412_000_000_000, numberOfAnalysts: 36, isHistorical: true, beat: true, actualRevenue: 408_000_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Sep 2026", periodEndDate: "2026-09-26", revenueEstimate: 430_000_000_000, revenueYoyGrowthPct: 5.4, revenueAvg: 430_000_000_000, revenueLow: 415_000_000_000, revenueHigh: 448_000_000_000, numberOfAnalysts: 33, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Sep 2027", periodEndDate: "2027-09-25", revenueEstimate: 455_000_000_000, revenueYoyGrowthPct: 5.8, revenueAvg: 455_000_000_000, revenueLow: 432_000_000_000, revenueHigh: 478_000_000_000, numberOfAnalysts: 25, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
    },
    priceTargets: {
      meanTarget: 228.5,
      medianTarget: 225,
      highTarget: 260,
      lowTarget: 178,
      numberOfAnalysts: 38,
      recommendationMean: 1.9,
      recommendationKey: "buy",
      distribution: { strongBuy: 15, buy: 20, hold: 8, sell: 1, strongSell: 0 },
    },
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
      preMarketTime: Date.now(),
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: 140.05,
      dayHigh: 141.3,
      dayLow: 137.9,
      previousClose: 140.86,
      firstTradeDateEpochMs: null,
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
        priceToFreeCashFlow: 50.6,
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
      // FY2026 (ended Jan 25, 2026) and TTM (through Q1 FY27, ended Apr 26,
      // 2026) are real, exact figures pulled from NVIDIA's own press
      // releases (sec.gov/Archives/edgar/data/1045810/000104581026000019/q4fy26pr.htm
      // and .../000104581026000051/q1fy27pr.htm), not illustrative
      // estimates like the rounder rows above — added after a user report
      // that this fallback data was stale (this mock previously topped out
      // at FY2025/an old TTM snapshot, well behind NVDA's real growth
      // since). TTM = FY2026 full year minus Q1 FY26 plus Q1 FY27 (rolling
      // four quarters); its $253.491B revenue lines up with the $253.49B
      // TTM figure independently reported by a professional terminal.
      { fiscalYear: "2026", totalRevenue: 215_938_000_000, grossProfit: 153_463_000_000, operatingIncome: 130_387_000_000, netIncome: 120_067_000_000, eps: 4.90, sharesOutstandingDiluted: 24_514_000_000, dividendsPerShare: 0.04 },
      { fiscalYear: "TTM", totalRevenue: 253_491_000_000, grossProfit: 187_952_000_000, operatingIncome: 162_285_000_000, netIncome: 159_613_000_000, eps: 6.54, sharesOutstandingDiluted: 24_391_000_000, dividendsPerShare: 0.04 },
    ],
    balance: [
      { fiscalYear: "2022", totalAssets: 44_187_000_000, totalLiabilities: 17_575_000_000, totalStockholdersEquity: 26_612_000_000, cashAndShortTermInvestments: 21_209_000_000, totalCurrentAssets: 28_829_000_000, totalCurrentLiabilities: 4_335_000_000, totalCash: 3_389_000_000, totalDebt: 10_946_000_000 },
      { fiscalYear: "2023", totalAssets: 41_182_000_000, totalLiabilities: 19_081_000_000, totalStockholdersEquity: 22_101_000_000, cashAndShortTermInvestments: 13_296_000_000, totalCurrentAssets: 23_073_000_000, totalCurrentLiabilities: 6_563_000_000, totalCash: 3_389_000_000, totalDebt: 9_703_000_000 },
      { fiscalYear: "2024", totalAssets: 65_728_000_000, totalLiabilities: 22_750_000_000, totalStockholdersEquity: 42_978_000_000, cashAndShortTermInvestments: 25_984_000_000, totalCurrentAssets: 44_345_000_000, totalCurrentLiabilities: 10_631_000_000, totalCash: 7_280_000_000, totalDebt: 9_500_000_000 },
      { fiscalYear: "2025", totalAssets: 111_601_000_000, totalLiabilities: 32_274_000_000, totalStockholdersEquity: 79_327_000_000, cashAndShortTermInvestments: 43_210_000_000, totalCurrentAssets: 80_126_000_000, totalCurrentLiabilities: 18_047_000_000, totalCash: 8_589_000_000, totalDebt: 8_463_000_000 },
      // FY2026 (as of Jan 25, 2026) and TTM (as of Q1 FY27, Apr 26, 2026) —
      // real figures, same sourcing as the income statement array's doc
      // comment above. A balance sheet is a point-in-time snapshot, not a
      // sum over four quarters like income/cash flow, so "TTM" here is
      // simply the latest available quarter's real balance sheet.
      { fiscalYear: "2026", totalAssets: 206_803_000_000, totalLiabilities: 49_510_000_000, totalStockholdersEquity: 157_293_000_000, cashAndShortTermInvestments: 62_556_000_000, totalCurrentAssets: 125_605_000_000, totalCurrentLiabilities: 32_163_000_000, totalCash: 10_605_000_000, totalDebt: 8_468_000_000 },
      { fiscalYear: "TTM", totalAssets: 259_474_000_000, totalLiabilities: 64_000_000_000, totalStockholdersEquity: 195_474_000_000, cashAndShortTermInvestments: 80_572_000_000, totalCurrentAssets: 150_995_000_000, totalCurrentLiabilities: 43_884_000_000, totalCash: 13_237_000_000, totalDebt: 8_470_000_000 },
    ],
    cashFlow: [
      { fiscalYear: "2022", operatingCashFlow: 9_108_000_000, freeCashFlow: 8_132_000_000, stockBasedCompensation: 2_004_000_000, capitalExpenditures: -1_833_000_000, netIncome: 9_752_000_000 },
      { fiscalYear: "2023", operatingCashFlow: 5_641_000_000, freeCashFlow: 3_808_000_000, stockBasedCompensation: 2_709_000_000, capitalExpenditures: -1_833_000_000, netIncome: 4_368_000_000 },
      { fiscalYear: "2024", operatingCashFlow: 28_090_000_000, freeCashFlow: 27_021_000_000, stockBasedCompensation: 3_549_000_000, capitalExpenditures: -1_069_000_000, netIncome: 29_760_000_000 },
      { fiscalYear: "2025", operatingCashFlow: 64_089_000_000, freeCashFlow: 60_724_000_000, stockBasedCompensation: 4_737_000_000, capitalExpenditures: -3_236_000_000, netIncome: 72_880_000_000 },
      // FY2026 and TTM (through Q1 FY27) — real figures, same sourcing as above.
      { fiscalYear: "2026", operatingCashFlow: 102_718_000_000, freeCashFlow: 96_575_000_000, stockBasedCompensation: 6_386_000_000, capitalExpenditures: -6_042_000_000, netIncome: 120_067_000_000 },
      { fiscalYear: "TTM", operatingCashFlow: 125_648_000_000, freeCashFlow: 118_994_000_000, stockBasedCompensation: 6_840_000_000, capitalExpenditures: -6_572_000_000, netIncome: 159_613_000_000 },
    ],
    estimates: {
      quarterly: [
        { fiscalPeriodLabel: "Apr 2025", periodEndDate: "2025-04-27", revenueEstimate: 43_000_000_000, revenueYoyGrowthPct: 65.2, revenueAvg: 43_000_000_000, revenueLow: 41_200_000_000, revenueHigh: 44_800_000_000, numberOfAnalysts: 42, isHistorical: true, beat: true, actualRevenue: 44_100_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Jul 2025", periodEndDate: "2025-07-27", revenueEstimate: 45_800_000_000, revenueYoyGrowthPct: 53.1, revenueAvg: 45_800_000_000, revenueLow: 43_500_000_000, revenueHigh: 47_600_000_000, numberOfAnalysts: 44, isHistorical: true, beat: true, actualRevenue: 46_700_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Oct 2025", periodEndDate: "2025-10-26", revenueEstimate: 54_000_000_000, revenueYoyGrowthPct: 48.7, revenueAvg: 54_000_000_000, revenueLow: 51_000_000_000, revenueHigh: 57_200_000_000, numberOfAnalysts: 45, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Jan 2026", periodEndDate: "2026-01-25", revenueEstimate: 58_500_000_000, revenueYoyGrowthPct: 41.5, revenueAvg: 58_500_000_000, revenueLow: 54_800_000_000, revenueHigh: 62_400_000_000, numberOfAnalysts: 40, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
      annual: [
        { fiscalPeriodLabel: "Jan 2024", periodEndDate: "2024-01-28", revenueEstimate: 59_000_000_000, revenueYoyGrowthPct: 118.9, revenueAvg: 59_000_000_000, revenueLow: 56_100_000_000, revenueHigh: 61_400_000_000, numberOfAnalysts: 46, isHistorical: true, beat: true, actualRevenue: 60_922_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Jan 2025", periodEndDate: "2025-01-26", revenueEstimate: 128_000_000_000, revenueYoyGrowthPct: 114.2, revenueAvg: 128_000_000_000, revenueLow: 122_500_000_000, revenueHigh: 133_800_000_000, numberOfAnalysts: 48, isHistorical: true, beat: true, actualRevenue: 130_500_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Jan 2026", periodEndDate: "2026-01-25", revenueEstimate: 205_000_000_000, revenueYoyGrowthPct: 57.1, revenueAvg: 205_000_000_000, revenueLow: 192_000_000_000, revenueHigh: 218_000_000_000, numberOfAnalysts: 44, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Jan 2027", periodEndDate: "2027-01-24", revenueEstimate: 260_000_000_000, revenueYoyGrowthPct: 26.8, revenueAvg: 260_000_000_000, revenueLow: 238_000_000_000, revenueHigh: 282_000_000_000, numberOfAnalysts: 33, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
    },
    priceTargets: {
      meanTarget: 175.4,
      medianTarget: 172,
      highTarget: 220,
      lowTarget: 120,
      numberOfAnalysts: 55,
      recommendationMean: 1.5,
      recommendationKey: "strong_buy",
      distribution: { strongBuy: 35, buy: 15, hold: 4, sell: 0, strongSell: 0 },
    },
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
      preMarketTime: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: 6790,
      dayHigh: 6855,
      dayLow: 6765,
      previousClose: 6775,
      firstTradeDateEpochMs: null,
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
        priceToFreeCashFlow: 10.6,
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
    balance: [
      { fiscalYear: "2021", totalAssets: 46_711_000_000, totalLiabilities: 30_609_000_000, totalStockholdersEquity: 16_102_000_000, cashAndShortTermInvestments: 1_589_000_000, totalCurrentAssets: 10_940_000_000, totalCurrentLiabilities: 8_662_000_000, totalCash: 1_589_000_000, totalDebt: 19_814_000_000 },
      { fiscalYear: "2022", totalAssets: 42_053_000_000, totalLiabilities: 28_942_000_000, totalStockholdersEquity: 13_111_000_000, cashAndShortTermInvestments: 1_650_000_000, totalCurrentAssets: 10_100_000_000, totalCurrentLiabilities: 8_200_000_000, totalCash: 1_650_000_000, totalDebt: 18_600_000_000 },
      { fiscalYear: "2023", totalAssets: 40_500_000_000, totalLiabilities: 27_800_000_000, totalStockholdersEquity: 12_700_000_000, cashAndShortTermInvestments: 1_950_000_000, totalCurrentAssets: 9_800_000_000, totalCurrentLiabilities: 7_900_000_000, totalCash: 1_950_000_000, totalDebt: 17_500_000_000 },
      { fiscalYear: "2024", totalAssets: 39_800_000_000, totalLiabilities: 27_100_000_000, totalStockholdersEquity: 12_700_000_000, cashAndShortTermInvestments: 2_200_000_000, totalCurrentAssets: 9_950_000_000, totalCurrentLiabilities: 7_600_000_000, totalCash: 2_200_000_000, totalDebt: 16_800_000_000 },
      { fiscalYear: "TTM", totalAssets: 39_200_000_000, totalLiabilities: 26_500_000_000, totalStockholdersEquity: 12_700_000_000, cashAndShortTermInvestments: 2_400_000_000, totalCurrentAssets: 10_050_000_000, totalCurrentLiabilities: 7_400_000_000, totalCash: 2_400_000_000, totalDebt: 16_100_000_000 },
    ],
    cashFlow: [
      { fiscalYear: "2021", operatingCashFlow: 2_450_000_000, freeCashFlow: 2_000_000_000, stockBasedCompensation: 95_000_000, capitalExpenditures: -450_000_000, netIncome: 458_000_000 },
      { fiscalYear: "2022", operatingCashFlow: 2_180_000_000, freeCashFlow: 1_760_000_000, stockBasedCompensation: 88_000_000, capitalExpenditures: -420_000_000, netIncome: 736_000_000 },
      { fiscalYear: "2023", operatingCashFlow: 2_050_000_000, freeCashFlow: 1_650_000_000, stockBasedCompensation: 92_000_000, capitalExpenditures: -400_000_000, netIncome: 320_000_000 },
      { fiscalYear: "2024", operatingCashFlow: 2_600_000_000, freeCashFlow: 2_170_000_000, stockBasedCompensation: 98_000_000, capitalExpenditures: -430_000_000, netIncome: 890_000_000 },
      { fiscalYear: "TTM", operatingCashFlow: 2_750_000_000, freeCashFlow: 2_310_000_000, stockBasedCompensation: 101_000_000, capitalExpenditures: -440_000_000, netIncome: 955_000_000 },
    ],
    estimates: {
      quarterly: [
        { fiscalPeriodLabel: "Jun 2025", periodEndDate: "2025-06-30", revenueEstimate: 4_100_000_000, revenueYoyGrowthPct: 2.1, revenueAvg: 4_100_000_000, revenueLow: 3_950_000_000, revenueHigh: 4_250_000_000, numberOfAnalysts: 14, isHistorical: true, beat: true, actualRevenue: 4_250_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Sep 2025", periodEndDate: "2025-09-30", revenueEstimate: 4_000_000_000, revenueYoyGrowthPct: 1.4, revenueAvg: 4_000_000_000, revenueLow: 3_850_000_000, revenueHigh: 4_150_000_000, numberOfAnalysts: 13, isHistorical: true, beat: false, actualRevenue: 3_950_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Dec 2025", periodEndDate: "2025-12-31", revenueEstimate: 4_300_000_000, revenueYoyGrowthPct: 3.2, revenueAvg: 4_300_000_000, revenueLow: 4_100_000_000, revenueHigh: 4_450_000_000, numberOfAnalysts: 12, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Mar 2026", periodEndDate: "2026-03-31", revenueEstimate: 3_950_000_000, revenueYoyGrowthPct: 2.6, revenueAvg: 3_950_000_000, revenueLow: 3_780_000_000, revenueHigh: 4_100_000_000, numberOfAnalysts: 12, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
      annual: [
        { fiscalPeriodLabel: "Dec 2023", periodEndDate: "2023-12-31", revenueEstimate: 15_700_000_000, revenueYoyGrowthPct: 5.6, revenueAvg: 15_700_000_000, revenueLow: 15_400_000_000, revenueHigh: 16_000_000_000, numberOfAnalysts: 17, isHistorical: true, beat: true, actualRevenue: 15_838_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Dec 2024", periodEndDate: "2024-12-31", revenueEstimate: 16_300_000_000, revenueYoyGrowthPct: 4.2, revenueAvg: 16_300_000_000, revenueLow: 15_900_000_000, revenueHigh: 16_700_000_000, numberOfAnalysts: 18, isHistorical: true, beat: true, actualRevenue: 16_500_000_000, epsActual: null, epsEstimate: null, beatBasis: "revenue" },
        { fiscalPeriodLabel: "Dec 2025", periodEndDate: "2025-12-31", revenueEstimate: 16_900_000_000, revenueYoyGrowthPct: 2.4, revenueAvg: 16_900_000_000, revenueLow: 16_400_000_000, revenueHigh: 17_300_000_000, numberOfAnalysts: 16, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
        { fiscalPeriodLabel: "Dec 2026", periodEndDate: "2026-12-31", revenueEstimate: 17_400_000_000, revenueYoyGrowthPct: 3.0, revenueAvg: 17_400_000_000, revenueLow: 16_700_000_000, revenueHigh: 18_000_000_000, numberOfAnalysts: 14, isHistorical: false, beat: null, actualRevenue: null, epsActual: null, epsEstimate: null, beatBasis: null },
      ],
    },
    priceTargets: {
      // Agorot, same raw-unit convention as quote.price for this symbol (₪78 -> 7800).
      meanTarget: 7800,
      medianTarget: 7700,
      highTarget: 9200,
      lowTarget: 6000,
      numberOfAnalysts: 12,
      recommendationMean: 2.3,
      recommendationKey: "hold",
      distribution: { strongBuy: 2, buy: 4, hold: 5, sell: 1, strongSell: 0 },
    },
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

  // Minimal index mock: proves the "hide fundamentals tabs for indices"
  // logic (isIndexQuote() in lib/finance/exchange.ts, gated in
  // app/analysis/[symbol]/page.tsx) end-to-end inside this sandbox, since
  // the live provider is unreachable here and indices otherwise fall
  // through to the plain "no data" error state rather than exercising that
  // code path at all. All fundamentals-shaped fields are null/empty on
  // purpose — an index genuinely has no income statement, balance sheet,
  // cash flow, or analyst estimates to show.
  "^TA125.TA": {
    source: "mock",
    reportingCurrency: "ILA",
    quote: {
      symbol: "^TA125.TA",
      name: "TA-125 Index",
      exchange: "TLV",
      currency: "ILA",
      quoteType: "INDEX",
      price: 2_142_530,
      change: 8_410,
      changePercent: 0.39,
      marketCap: null,
      marketState: "REGULAR",
      asOf: Date.now(),
      timezone: "Asia/Jerusalem",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      preMarketTime: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      postMarketTime: null,
      dayOpen: 2_136_800,
      dayHigh: 2_145_900,
      dayLow: 2_134_100,
      previousClose: 2_134_120,
      firstTradeDateEpochMs: null,
    },
    profile: {
      sector: null,
      industry: null,
      website: null,
      ceo: null,
      description:
        "The TA-125 Index tracks the 125 largest and most liquid companies listed on the Tel Aviv Stock Exchange.",
    },
    metrics: {
      financials: {
        marketCap: null,
        peRatio: null,
        forwardPE: null,
        forwardPeg: null,
        priceToCashFlow: null,
        priceToFreeCashFlow: null,
      },
      yields: {
        earningsYield: null,
        cashFlowYield: null,
        freeCashFlowYield: null,
        dividendYield: null,
        payoutRatio: null,
      },
      balances: { totalCash: null, totalDebt: null, netCashPosition: null },
      margins: { grossMargin: null, operatingMargin: null, netIncomeMargin: null },
    },
    income: [],
    balance: [],
    cashFlow: [],
    estimates: { quarterly: [], annual: [] },
    priceTargets: null,
    history: generateSyntheticHistory({
      seed: "^TA125.TA",
      endPrice: 21_425.3,
      annualDriftPct: 9,
      annualVolPct: 18,
    }).map((p) => ({
      // Same agorot-scaling convention as TEVA.TA above.
      date: p.date,
      open: Math.round(p.open * 100),
      high: Math.round(p.high * 100),
      low: Math.round(p.low * 100),
      close: Math.round(p.close * 100),
    })),
  },
};

export function getMockFundamentals(symbol: string): FundamentalsBundle | null {
  const bundle = MOCK_FUNDAMENTALS[symbol.toUpperCase()];
  if (!bundle) return null;
  // Same post-merge revenue join getFundamentals() (yahoo.ts) applies to
  // live data — see backfillCashFlowRevenue's doc comment (aggregate.ts).
  // These hand-authored fixtures have no quarterly arrays (see the module
  // doc comment above), so only the annual cashFlow needs the join.
  return { ...bundle, cashFlow: backfillCashFlowRevenue(bundle.cashFlow, bundle.income) };
}
