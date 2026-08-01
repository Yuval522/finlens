import { splitTrailingRow } from "./chart-transform";
import { average, computePiotroskiScore, fmtPct, fmtRatio, scaleScore } from "./score";
import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear, TickerMetrics } from "./types";

/**
 * "GuruFocus-style" multi-pillar rating model — a second, independent lens
 * on the Score tab alongside the existing 4-category Composite Financial
 * Health Score (see score.ts). Modeled after the four rating *pillars*
 * GuruFocus.com publicly shows on its own stock pages (Financial Strength,
 * Profitability Rank, Growth Rank, and a valuation/"GF Value" indicator),
 * each displayed there as a 1-10 rank.
 *
 * IMPORTANT — this is NOT a reproduction of GuruFocus's proprietary
 * algorithm, which they don't publish. Their real formulas use inputs this
 * app's data model doesn't have (their Financial Strength component folds
 * in interest coverage and a full Altman Z-Score, which needs retained
 * earnings broken out from equity — the same limitation already documented
 * in score.ts's module comment for the Composite Score's Financial
 * Strength category) and their GF Value is a proprietary intrinsic-value
 * regression against historical median multiples and analyst estimates
 * that can't be reconstructed without their model. This file is FinLens's
 * own, independently-derived approximation of the *shape* of that rating
 * system (four 1-10 pillar ranks), computed purely from data already in
 * this app's fundamentals bundle, with every threshold documented below
 * the same way score.ts documents its own. Not affiliated with, endorsed
 * by, or sourced from GuruFocus LLC. Not investment advice.
 */

export interface GuruRankItem {
  label: string;
  displayValue: string;
  /** 0-100, null when this sub-metric couldn't be computed. */
  score: number | null;
}

export interface GuruPillar {
  name: string;
  /** 1-10, GuruFocus' own display convention — null only when nothing in this pillar could be computed at all. */
  rank: number | null;
  items: GuruRankItem[];
  /** Shown in this pillar's info tooltip. */
  explanation: string;
}

export interface GuruFocusRatingResult {
  overallRank: number | null;
  overallLabel: string;
  pillars: GuruPillar[];
  /** Valuation pillar's qualitative band, e.g. "Undervalued" — GuruFocus shows a similar band next to its own GF Value indicator. */
  valuationLabel: string;
}

/** Maps a 0-100 score onto GuruFocus' 1-10 rank scale. A rank is only null when the underlying score itself is null — otherwise it's clamped to at least 1, never 0. */
function rankFromScore(score: number | null): number | null {
  if (score == null) return null;
  return Math.min(10, Math.max(1, Math.round(score / 10)));
}

function overallLabelFromRank(rank: number | null): string {
  if (rank == null) return "—";
  if (rank >= 8) return "Strong";
  if (rank >= 6) return "Above Average";
  if (rank >= 4) return "Average";
  if (rank >= 2) return "Below Average";
  return "Weak";
}

function valuationLabelFromRank(rank: number | null): string {
  if (rank == null) return "—";
  if (rank >= 8) return "Significantly Undervalued";
  if (rank >= 6) return "Undervalued";
  if (rank >= 4) return "Fairly Valued";
  if (rank >= 2) return "Overvalued";
  return "Significantly Overvalued";
}

/** Compound annual growth rate from `base` to `current` over `years` years, as a percent. Null unless both figures are genuinely positive — a CAGR spanning a loss year isn't a meaningful growth rate, so this deliberately leaves the metric blank rather than computing a misleading one. */
function cagrPct(current: number, base: number, years: number): number | null {
  if (years <= 0 || base <= 0 || current <= 0) return null;
  return (Math.pow(current / base, 1 / years) - 1) * 100;
}

interface ComputeGuruInput {
  metrics: TickerMetrics;
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  currency: string;
}

export function computeGuruFocusRating({
  metrics,
  income,
  balance,
  cashFlow,
  currency,
}: ComputeGuruInput): GuruFocusRatingResult {
  const inc = splitTrailingRow(income).historical;
  const bal = splitTrailingRow(balance).historical;
  const curInc = inc[inc.length - 1];
  const prevInc = inc[inc.length - 2];
  const curBal = bal[bal.length - 1];

  // --- Financial Strength: cash-to-debt, equity-to-assets, debt-to-EBITDA
  // (operating income used as an EBITDA proxy — see the module doc comment
  // for why a real D&A-inclusive EBITDA isn't available here), and the
  // existing Piotroski F-Score folded in as a fundamentals-quality signal
  // — the same way GuruFocus's own published writeups describe Piotroski
  // as one input among several to their Financial Strength rank.
  const cashToDebt = curBal ? (curBal.totalDebt > 0 ? curBal.totalCash / curBal.totalDebt : Infinity) : null;
  const cashToDebtScore = cashToDebt == null ? null : Number.isFinite(cashToDebt) ? scaleScore(cashToDebt, 0, 1.5) : 100;
  const equityToAssets = curBal && curBal.totalAssets > 0 ? curBal.totalStockholdersEquity / curBal.totalAssets : null;
  const equityToAssetsScore = scaleScore(equityToAssets, 0.2, 0.8);
  const debtToEbitda =
    curBal && curInc && curInc.operatingIncome > 0 ? (curBal.totalDebt > 0 ? curBal.totalDebt / curInc.operatingIncome : 0) : null;
  const debtToEbitdaScore = scaleScore(debtToEbitda, 5, 0);
  const piotroski = computePiotroskiScore(income, balance, cashFlow, currency);
  const piotroskiScore = piotroski ? (piotroski.score / piotroski.maxScore) * 100 : null;

  const financialStrengthScore = average([cashToDebtScore, equityToAssetsScore, debtToEbitdaScore, piotroskiScore]);
  const financialStrength: GuruPillar = {
    name: "Financial Strength",
    rank: rankFromScore(financialStrengthScore),
    explanation:
      "Balance-sheet resilience — cash cushion relative to debt, how much of the balance sheet is equity-funded vs. debt-funded, and debt relative to operating income, plus the Piotroski F-Score as a fundamentals-quality check. GuruFocus's own Financial Strength rank additionally uses interest coverage and a full Altman Z-Score — both need data fields (interest expense, retained earnings) this app's data model doesn't carry.",
    items: [
      {
        label: "Cash-to-Debt",
        displayValue: cashToDebt == null ? "—" : Number.isFinite(cashToDebt) ? `${cashToDebt.toFixed(2)}x` : "Debt-free",
        score: cashToDebtScore,
      },
      {
        label: "Equity-to-Assets",
        displayValue: fmtPct(equityToAssets != null ? equityToAssets * 100 : null),
        score: equityToAssetsScore,
      },
      {
        label: "Debt-to-EBITDA (op. income proxy)",
        displayValue: debtToEbitda == null ? "—" : `${debtToEbitda.toFixed(1)}x`,
        score: debtToEbitdaScore,
      },
      {
        label: "Piotroski F-Score",
        displayValue: piotroski ? `${piotroski.score}/${piotroski.maxScore}` : "—",
        score: piotroskiScore,
      },
    ],
  };

  // --- Profitability: margins plus ROE/ROA, higher is better.
  const roe = curInc && curBal && curBal.totalStockholdersEquity !== 0 ? (curInc.netIncome / curBal.totalStockholdersEquity) * 100 : null;
  const roa = curInc && curBal && curBal.totalAssets !== 0 ? (curInc.netIncome / curBal.totalAssets) * 100 : null;
  const grossScore = scaleScore(metrics.margins.grossMargin, 20, 70);
  const opScore = scaleScore(metrics.margins.operatingMargin, 0, 35);
  const netScore = scaleScore(metrics.margins.netIncomeMargin, 0, 25);
  const roeScore = scaleScore(roe, 0, 30);
  const roaScore = scaleScore(roa, 0, 15);
  const profitabilityScore = average([grossScore, opScore, netScore, roeScore, roaScore]);
  const profitability: GuruPillar = {
    name: "Profitability",
    rank: rankFromScore(profitabilityScore),
    explanation:
      "Margin quality and capital returns — how much of each revenue dollar a company keeps, and how efficiently it turns equity and total assets into profit. GuruFocus's own Profitability Rank additionally weighs multi-year margin consistency (\"predictability\"), which needs a longer clean historical window than every ticker in this app is guaranteed to have.",
    items: [
      { label: "Gross Margin", displayValue: fmtPct(metrics.margins.grossMargin), score: grossScore },
      { label: "Operating Margin", displayValue: fmtPct(metrics.margins.operatingMargin), score: opScore },
      { label: "Net Margin", displayValue: fmtPct(metrics.margins.netIncomeMargin), score: netScore },
      { label: "Return on Equity", displayValue: fmtPct(roe), score: roeScore },
      { label: "Return on Assets", displayValue: fmtPct(roa), score: roaScore },
    ],
  };

  // --- Growth: multi-year CAGR (up to 3 fiscal years back) plus the most
  // recent single-year YoY move — GuruFocus's own description blends
  // multi-year and most-recent growth into one rank the same way.
  const yearsBack = Math.min(3, inc.length - 1);
  const baseInc = yearsBack > 0 ? inc[inc.length - 1 - yearsBack] : null;
  const revCagr = curInc && baseInc ? cagrPct(curInc.totalRevenue, baseInc.totalRevenue, yearsBack) : null;
  const epsCagr = curInc && baseInc ? cagrPct(curInc.eps, baseInc.eps, yearsBack) : null;
  const revGrowthYoY =
    curInc && prevInc && prevInc.totalRevenue > 0 ? ((curInc.totalRevenue - prevInc.totalRevenue) / prevInc.totalRevenue) * 100 : null;
  const revCagrScore = scaleScore(revCagr, -5, 20);
  const epsCagrScore = scaleScore(epsCagr, -10, 25);
  const revGrowthYoYScore = scaleScore(revGrowthYoY, -10, 25);
  const growthScore = average([revCagrScore, epsCagrScore, revGrowthYoYScore]);
  const growth: GuruPillar = {
    name: "Growth",
    rank: rankFromScore(growthScore),
    explanation: `Revenue and EPS growth over ${
      yearsBack > 0 ? `the trailing ${yearsBack}-year window` : "the latest year"
    }, plus the most recent single year's revenue growth as a momentum check. A CAGR is left blank whenever the start or end year had a loss or non-positive revenue, rather than computing a misleading rate through a loss year.`,
    items: [
      { label: `Revenue CAGR (${yearsBack || 1}Y)`, displayValue: fmtPct(revCagr), score: revCagrScore },
      { label: `EPS CAGR (${yearsBack || 1}Y)`, displayValue: fmtPct(epsCagr), score: epsCagrScore },
      { label: "Revenue Growth (YoY)", displayValue: fmtPct(revGrowthYoY), score: revGrowthYoYScore },
    ],
  };

  // --- Valuation: cheaper scores higher, same direction as score.ts's own
  // Valuation category, with Price/Cash Flow added. GuruFocus's real GF
  // Value is a proprietary fair-value regression this app can't reproduce
  // without their model, so this pillar reports relative cheapness across
  // four independent multiples/yields instead of a specific fair-value
  // price target.
  const peScore = scaleScore(metrics.financials.peRatio, 45, 10);
  const pegScore = scaleScore(metrics.financials.forwardPeg, 3, 0.5);
  const fcfYieldScore = scaleScore(metrics.yields.freeCashFlowYield, 0, 8);
  const pcfScore = scaleScore(metrics.financials.priceToCashFlow, 30, 8);
  const valuationScore = average([peScore, pegScore, fcfYieldScore, pcfScore]);
  const valuationRank = rankFromScore(valuationScore);
  const valuation: GuruPillar = {
    name: "Valuation",
    rank: valuationRank,
    explanation:
      "How cheap the stock looks across four independent multiples/yields at once rather than any single ratio. GuruFocus's own GF Value line is a proprietary fair-value regression against historical median multiples and analyst estimates — not something this app can reproduce without their model, so this pillar reports relative cheapness instead of a specific fair-value price.",
    items: [
      { label: "P/E Ratio", displayValue: fmtRatio(metrics.financials.peRatio), score: peScore },
      { label: "Forward PEG Ratio", displayValue: fmtRatio(metrics.financials.forwardPeg), score: pegScore },
      { label: "Free Cash Flow Yield", displayValue: fmtPct(metrics.yields.freeCashFlowYield), score: fcfYieldScore },
      { label: "Price / Cash Flow", displayValue: fmtRatio(metrics.financials.priceToCashFlow), score: pcfScore },
    ],
  };

  const pillars = [financialStrength, profitability, growth, valuation];
  // Recomputed straight from each pillar's own 0-100 score (not from the
  // already-rounded 1-10 ranks below), so the overall figure doesn't
  // compound two separate rounding passes.
  const overallScore = average([financialStrengthScore, profitabilityScore, growthScore, valuationScore]);
  const overallRank = rankFromScore(overallScore);

  return {
    overallRank,
    overallLabel: overallLabelFromRank(overallRank),
    pillars,
    valuationLabel: valuationLabelFromRank(valuationRank),
  };
}
