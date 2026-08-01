import { splitTrailingRow } from "./chart-transform";
import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear, TickerMetrics } from "./types";

/**
 * Score tab — financial scoring/health model, computed entirely from data
 * already in the fundamentals bundle (income/balance/cashFlow/metrics), no
 * new data source needed. Two complementary models:
 *
 * 1. Piotroski F-Score (computePiotroskiScore) — the textbook 9-point test,
 *    computed for real off two consecutive fiscal years. One deliberate,
 *    documented adaptation: the classic test's "change in long-term debt
 *    ratio" criterion uses *total* debt/assets instead, since this data
 *    model (like most free-tier providers) doesn't break long-term debt out
 *    from total debt separately — see the leverage criterion below.
 *
 * 2. Composite Financial Health Score (computeCompositeScore) — a 4-category
 *    (Valuation / Profitability / Growth / Financial Strength) 0-100 rating.
 *    This is a genuine substitute for Altman Z-Score, not a shortcut: Altman
 *    Z requires retained earnings and paid-in capital broken out separately
 *    from total stockholders' equity, and neither field exists anywhere in
 *    this app's balance-sheet data model (BalanceSheetYear in types.ts) —
 *    approximating retained earnings from total equity would silently
 *    misrepresent a real company's bankruptcy-risk score, which is worse
 *    than not offering the metric. The composite score below uses only
 *    fields this app actually has, with every threshold documented so it's
 *    a transparent, reproducible heuristic rather than a black box.
 */

// ---------------------------------------------------------------------------
// Piotroski F-Score
// ---------------------------------------------------------------------------

export interface PiotroskiCriterion {
  label: string;
  passed: boolean;
  detail: string;
}

export interface PiotroskiResult {
  score: number;
  maxScore: 9;
  criteria: PiotroskiCriterion[];
  /** The two fiscal years compared, oldest first. */
  years: [string, string];
}

function compactMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B ${currency}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M ${currency}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K ${currency}`;
  return `${sign}${abs.toFixed(0)} ${currency}`;
}

/**
 * Computes the 9-point Piotroski F-Score from the two most recent complete
 * fiscal years. Returns null when there isn't enough historical depth (needs
 * 2 real fiscal years — the TTM/MRQ trailing appendix is excluded via
 * splitTrailingRow, same as every chart panel).
 *
 * QA fix: this used to also carry a "Positive Net Income" criterion,
 * bringing the list to 10 items while `score`/`maxScore` were still
 * computed and labeled as a 9-point test — a numerator/denominator
 * mismatch that could show e.g. "10/9". That criterion wasn't part of the
 * classic Piotroski signal set to begin with, and was mathematically
 * redundant with "Positive Return on Assets" directly below it (ROA =
 * netIncome/totalAssets, so for any company with positive total assets the
 * two always agree in sign) — removed rather than bumping maxScore to 10,
 * to restore the textbook 9-signal test this function is documented as
 * computing.
 */
export function computePiotroskiScore(
  income: IncomeStatementYear[],
  balance: BalanceSheetYear[],
  cashFlow: CashFlowYear[],
  currency: string
): PiotroskiResult | null {
  const inc = splitTrailingRow(income).historical;
  const bal = splitTrailingRow(balance).historical;
  const cf = splitTrailingRow(cashFlow).historical;

  if (inc.length < 2 || bal.length < 2 || cf.length < 2) return null;

  const curInc = inc[inc.length - 1];
  const prevInc = inc[inc.length - 2];
  const curBal = bal[bal.length - 1];
  const prevBal = bal[bal.length - 2];
  const curCf = cf[cf.length - 1];

  const roaCur = curBal.totalAssets > 0 ? curInc.netIncome / curBal.totalAssets : null;
  const roaPrev = prevBal.totalAssets > 0 ? prevInc.netIncome / prevBal.totalAssets : null;
  const leverageCur = curBal.totalAssets > 0 ? curBal.totalDebt / curBal.totalAssets : null;
  const leveragePrev = prevBal.totalAssets > 0 ? prevBal.totalDebt / prevBal.totalAssets : null;
  const currentRatioCur =
    curBal.totalCurrentLiabilities > 0 ? curBal.totalCurrentAssets / curBal.totalCurrentLiabilities : null;
  const currentRatioPrev =
    prevBal.totalCurrentLiabilities > 0 ? prevBal.totalCurrentAssets / prevBal.totalCurrentLiabilities : null;
  const grossMarginCur = curInc.totalRevenue > 0 ? curInc.grossProfit / curInc.totalRevenue : null;
  const grossMarginPrev = prevInc.totalRevenue > 0 ? prevInc.grossProfit / prevInc.totalRevenue : null;
  const assetTurnoverCur = curBal.totalAssets > 0 ? curInc.totalRevenue / curBal.totalAssets : null;
  const assetTurnoverPrev = prevBal.totalAssets > 0 ? prevInc.totalRevenue / prevBal.totalAssets : null;

  const criteria: PiotroskiCriterion[] = [
    {
      label: "Positive Return on Assets",
      passed: roaCur != null && roaCur > 0,
      detail: roaCur != null ? `ROA of ${(roaCur * 100).toFixed(1)}% in FY${curInc.fiscalYear}.` : "Insufficient data.",
    },
    {
      label: "Positive Operating Cash Flow",
      passed: curCf.operatingCashFlow > 0,
      detail: `Operating cash flow of ${compactMoney(curCf.operatingCashFlow, currency)} in FY${curCf.fiscalYear}.`,
    },
    {
      label: "Cash Flow Quality (OCF > Net Income)",
      passed: curCf.operatingCashFlow > curInc.netIncome,
      detail: `Operating cash flow ${curCf.operatingCashFlow > curInc.netIncome ? "exceeds" : "trails"} net income, a ${
        curCf.operatingCashFlow > curInc.netIncome ? "higher" : "lower"
      }-quality earnings signal.`,
    },
    {
      label: "Improving Return on Assets",
      passed: roaCur != null && roaPrev != null && roaCur > roaPrev,
      detail:
        roaCur != null && roaPrev != null
          ? `ROA moved from ${(roaPrev * 100).toFixed(1)}% (FY${prevInc.fiscalYear}) to ${(roaCur * 100).toFixed(1)}% (FY${curInc.fiscalYear}).`
          : "Insufficient data.",
    },
    {
      label: "Lower Leverage",
      passed: leverageCur != null && leveragePrev != null && leverageCur <= leveragePrev,
      detail:
        leverageCur != null && leveragePrev != null
          ? `Total debt/assets moved from ${(leveragePrev * 100).toFixed(1)}% to ${(leverageCur * 100).toFixed(1)}% — approximates the textbook long-term-debt-ratio test since long-term debt isn't broken out separately from total debt in this data model.`
          : "Insufficient data.",
    },
    {
      label: "Improving Liquidity",
      passed: currentRatioCur != null && currentRatioPrev != null && currentRatioCur > currentRatioPrev,
      detail:
        currentRatioCur != null && currentRatioPrev != null
          ? `Current ratio moved from ${currentRatioPrev.toFixed(2)}x to ${currentRatioCur.toFixed(2)}x.`
          : "Insufficient data.",
    },
    {
      label: "No New Shares Issued",
      passed: curInc.sharesOutstandingDiluted <= prevInc.sharesOutstandingDiluted * 1.001,
      detail: `Diluted shares outstanding moved from ${(prevInc.sharesOutstandingDiluted / 1e6).toFixed(0)}M to ${(
        curInc.sharesOutstandingDiluted / 1e6
      ).toFixed(0)}M — passes when shares didn't meaningfully increase (no dilutive issuance).`,
    },
    {
      label: "Improving Gross Margin",
      passed: grossMarginCur != null && grossMarginPrev != null && grossMarginCur > grossMarginPrev,
      detail:
        grossMarginCur != null && grossMarginPrev != null
          ? `Gross margin moved from ${(grossMarginPrev * 100).toFixed(1)}% to ${(grossMarginCur * 100).toFixed(1)}%.`
          : "Insufficient data.",
    },
    {
      label: "Improving Asset Turnover",
      passed: assetTurnoverCur != null && assetTurnoverPrev != null && assetTurnoverCur > assetTurnoverPrev,
      detail:
        assetTurnoverCur != null && assetTurnoverPrev != null
          ? `Revenue/assets moved from ${assetTurnoverPrev.toFixed(2)}x to ${assetTurnoverCur.toFixed(2)}x.`
          : "Insufficient data.",
    },
  ];

  return {
    score: criteria.filter((c) => c.passed).length,
    maxScore: 9,
    criteria,
    years: [prevInc.fiscalYear, curInc.fiscalYear],
  };
}

// ---------------------------------------------------------------------------
// Composite Financial Health Score
// ---------------------------------------------------------------------------

export interface ScoreItem {
  label: string;
  /** Formatted raw value, e.g. "30.1x", "+18.4%", "—" when unavailable. */
  displayValue: string;
  /** 0-100, null when this sub-metric couldn't be computed. */
  score: number | null;
}

export interface ScoreCategory {
  name: string;
  /** 0-100, null when every sub-metric in this category was unavailable. */
  score: number | null;
  items: ScoreItem[];
}

export interface CompositeScoreResult {
  /** 0-100, null only if every category was unavailable (should be rare — metrics.financials.peRatio alone covers most tickers). */
  overall: number | null;
  grade: string;
  categories: ScoreCategory[];
}

// Exported (not just used locally) so lib/finance/score-gurufocus.ts can
// share the exact same scaling/averaging/formatting conventions instead of
// re-deriving a second, possibly-drifting copy — see that file's module
// doc comment.

/** Clamps `value` into [worst, best] (order-independent — `best` may be less than `worst` for "lower is better" metrics) and linearly maps it to 0-100. */
export function scaleScore(value: number | null, worst: number, best: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const t = (value - worst) / (best - worst);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

export function average(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s != null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((a, b) => a + b, 0) / present.length);
}

export function fmtRatio(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}x`;
}
export function fmtPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function gradeFromScore(score: number | null): string {
  if (score == null) return "—";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

interface ComputeCompositeInput {
  metrics: TickerMetrics;
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
}

/**
 * Four-category 0-100 composite health score. Every threshold below is a
 * documented, fixed rule (not fitted to any particular ticker) — thresholds
 * are intentionally generous/generic across sectors, since this app has no
 * sector-relative peer data to compare against. Read this as "does this
 * look healthy on an absolute basis," not "does this look healthy for a
 * bank vs. a software company," which would need peer-relative benchmarks
 * this app doesn't have.
 */
export function computeCompositeScore({ metrics, income, balance, cashFlow }: ComputeCompositeInput): CompositeScoreResult {
  const inc = splitTrailingRow(income).historical;
  const bal = splitTrailingRow(balance).historical;
  const curInc = inc[inc.length - 1];
  const prevInc = inc[inc.length - 2];
  const curBal = bal[bal.length - 1];

  // --- Valuation: cheaper (lower P/E, lower PEG, higher FCF yield) scores higher.
  const peScore = scaleScore(metrics.financials.peRatio, 45, 10);
  const pegScore = scaleScore(metrics.financials.forwardPeg, 3, 0.5);
  const fcfYieldScore = scaleScore(metrics.yields.freeCashFlowYield, 0, 8);
  const valuation: ScoreCategory = {
    name: "Valuation",
    score: average([peScore, pegScore, fcfYieldScore]),
    items: [
      { label: "P/E Ratio", displayValue: fmtRatio(metrics.financials.peRatio), score: peScore },
      { label: "Forward PEG Ratio", displayValue: fmtRatio(metrics.financials.forwardPeg), score: pegScore },
      { label: "Free Cash Flow Yield", displayValue: fmtPct(metrics.yields.freeCashFlowYield), score: fcfYieldScore },
    ],
  };

  // --- Profitability: margins + ROE, higher is better.
  const roe =
    curInc && curBal && curBal.totalStockholdersEquity !== 0
      ? (curInc.netIncome / curBal.totalStockholdersEquity) * 100
      : null;
  const grossScore = scaleScore(metrics.margins.grossMargin, 20, 70);
  const opScore = scaleScore(metrics.margins.operatingMargin, 0, 35);
  const netScore = scaleScore(metrics.margins.netIncomeMargin, 0, 25);
  const roeScore = scaleScore(roe, 0, 30);
  const profitability: ScoreCategory = {
    name: "Profitability",
    score: average([grossScore, opScore, netScore, roeScore]),
    items: [
      { label: "Gross Margin", displayValue: fmtPct(metrics.margins.grossMargin), score: grossScore },
      { label: "Operating Margin", displayValue: fmtPct(metrics.margins.operatingMargin), score: opScore },
      { label: "Net Margin", displayValue: fmtPct(metrics.margins.netIncomeMargin), score: netScore },
      { label: "Return on Equity", displayValue: fmtPct(roe), score: roeScore },
    ],
  };

  // --- Growth: YoY revenue/net income/EPS, from the latest two real fiscal years.
  const revGrowth =
    curInc && prevInc && prevInc.totalRevenue > 0
      ? ((curInc.totalRevenue - prevInc.totalRevenue) / prevInc.totalRevenue) * 100
      : null;
  const niGrowth =
    curInc && prevInc && prevInc.netIncome !== 0
      ? ((curInc.netIncome - prevInc.netIncome) / Math.abs(prevInc.netIncome)) * 100
      : null;
  const epsGrowth =
    curInc && prevInc && prevInc.eps !== 0 ? ((curInc.eps - prevInc.eps) / Math.abs(prevInc.eps)) * 100 : null;
  const revGrowthScore = scaleScore(revGrowth, -10, 25);
  const niGrowthScore = scaleScore(niGrowth, -20, 30);
  const epsGrowthScore = scaleScore(epsGrowth, -20, 30);
  const growth: ScoreCategory = {
    name: "Growth",
    score: average([revGrowthScore, niGrowthScore, epsGrowthScore]),
    items: [
      { label: "Revenue Growth (YoY)", displayValue: fmtPct(revGrowth), score: revGrowthScore },
      { label: "Net Income Growth (YoY)", displayValue: fmtPct(niGrowth), score: niGrowthScore },
      { label: "EPS Growth (YoY)", displayValue: fmtPct(epsGrowth), score: epsGrowthScore },
    ],
  };

  // --- Financial Strength: liquidity + leverage, from the latest balance sheet.
  const currentRatio =
    curBal && curBal.totalCurrentLiabilities > 0 ? curBal.totalCurrentAssets / curBal.totalCurrentLiabilities : null;
  const debtToEquity =
    curBal && curBal.totalStockholdersEquity > 0 ? curBal.totalDebt / curBal.totalStockholdersEquity : null;
  const debtToAssets = curBal && curBal.totalAssets > 0 ? curBal.totalDebt / curBal.totalAssets : null;
  const currentRatioScore = scaleScore(currentRatio, 0.5, 2.5);
  const debtToEquityScore = scaleScore(debtToEquity, 3, 0);
  const debtToAssetsScore = scaleScore(debtToAssets, 0.6, 0);
  const strength: ScoreCategory = {
    name: "Financial Strength",
    score: average([currentRatioScore, debtToEquityScore, debtToAssetsScore]),
    items: [
      { label: "Current Ratio", displayValue: fmtRatio(currentRatio), score: currentRatioScore },
      { label: "Debt-to-Equity", displayValue: fmtRatio(debtToEquity), score: debtToEquityScore },
      { label: "Debt-to-Assets", displayValue: fmtRatio(debtToAssets), score: debtToAssetsScore },
    ],
  };

  const categories = [valuation, profitability, growth, strength];
  const overall = average(categories.map((c) => c.score));

  return { overall, grade: gradeFromScore(overall), categories };
}
