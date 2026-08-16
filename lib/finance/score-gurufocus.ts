import { splitTrailingRow } from "./chart-transform";
import { average, computePiotroskiScore, computeValuationScore, fmtPct, fmtRatio, scaleScore } from "./score";
import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear, PricePoint, TickerMetrics } from "./types";

/**
 * "GuruFocus-style" multi-pillar rating model — a second, independent lens
 * on the Score tab alongside the existing 4-category Composite Financial
 * Health Score (see score.ts). Modeled after the five rating *pillars*
 * GuruFocus.com publicly shows on its own stock pages' GF Score radar
 * chart (Financial Strength, Profitability, Growth, a valuation/"GF Value"
 * indicator, and Momentum), each displayed there as a 1-10 rank.
 *
 * IMPORTANT — this is NOT a reproduction of GuruFocus's proprietary
 * algorithm, which they don't publish. Their real formulas use inputs this
 * app's data model doesn't have (their Financial Strength component folds
 * in interest coverage and a full Altman Z-Score, which needs retained
 * earnings broken out from equity — the same limitation already documented
 * in score.ts's module comment for the Composite Score's Financial
 * Strength category; their Momentum rank divides trailing returns by the
 * stock's beta, which this app doesn't compute anywhere — see the Momentum
 * pillar below for what's used instead) and their GF Value is a
 * proprietary intrinsic-value regression against historical median
 * multiples and analyst estimates that can't be reconstructed without
 * their model. This file is Stox's own, independently-derived
 * approximation of the *shape* of that rating system (five 1-10 pillar
 * ranks), computed purely from data already in this app's fundamentals
 * bundle, with every threshold documented below the same way score.ts
 * documents its own. Not affiliated with, endorsed by, or sourced from
 * GuruFocus LLC. Not investment advice.
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
  /** 0-100, the un-rounded average this app's overallRank is itself derived
   *  from — exposed separately for the radar chart's badge, which mirrors
   *  GuruFocus's own "/100" GF Score display (shown alongside, not instead
   *  of, their 1-10 pentagon axes). Null only when every pillar was
   *  unavailable, same condition as overallRank being null. */
  overallScore: number | null;
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

/** Trailing percent return from `tradingDaysBack` days before the last
 *  close to the last close itself. Works on raw provider units (no
 *  toDisplayUnit conversion needed) since a ratio of two closes in the
 *  same subunit convention is unaffected by that convention's constant
 *  divisor. Null when there isn't enough history to look that far back. */
function trailingReturnPct(history: PricePoint[], tradingDaysBack: number): number | null {
  if (history.length === 0) return null;
  const lastIdx = history.length - 1;
  const baseIdx = lastIdx - tradingDaysBack;
  if (baseIdx < 0) return null;
  const base = history[baseIdx].close;
  if (base <= 0) return null;
  return ((history[lastIdx].close - base) / base) * 100;
}

interface ComputeGuruInput {
  metrics: TickerMetrics;
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  currency: string;
  /** Daily closes, oldest first — for the Momentum pillar's trailing return calculations. */
  history: PricePoint[];
  /** lib/finance/fair-value.ts's premiumDiscountPct, computed ONCE by the caller (see ScorePanel.tsx) and passed straight through here — see score.ts's ValuationInputs.fairValueDiscountPct doc comment for why the Valuation pillar must consume the exact same number the Fair Value Estimate card shows, rather than a second, locally-recomputed one that could drift from it. Optional/nullable for the same reason (recent IPOs, thin coverage — falls back to the other four Valuation sub-scores). */
  fairValueDiscountPct?: number | null;
}

export function computeGuruFocusRating({
  metrics,
  income,
  balance,
  cashFlow,
  currency,
  history,
  fairValueDiscountPct = null,
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
  const baseIdx = yearsBack > 0 ? inc.length - 1 - yearsBack : -1;
  const baseInc = baseIdx >= 0 ? inc[baseIdx] : null;
  const curIdx = inc.length - 1;
  const revCagr = curInc && baseInc ? cagrPct(curInc.totalRevenue, baseInc.totalRevenue, yearsBack) : null;

  // QA fix (live audit: AMZN's EPS CAGR showed blank/"—" and dragged the
  // Growth pillar down relative to GuruFocus, purely because FY2022 — one
  // endpoint of the naive fixed 3-year window — had a small net loss, even
  // though AMZN's earnings were otherwise growing solidly on either side of
  // that one year). A loss at the window's START has a sensible fix: widen
  // the window back to the nearest earlier fiscal year with genuinely
  // positive EPS, so one anomalous year doesn't blank an otherwise-real
  // multi-year growth trend — flagged via `epsCagrAdjustedWindow` so the UI
  // can label it as such rather than silently changing the window length.
  // A loss in the CURRENT (end) year has no equivalent fix — "growth into a
  // loss" isn't a meaningful percentage — so that case is deliberately
  // still left blank, same as before.
  let epsCagr: number | null = null;
  let epsCagrYearsBack = yearsBack;
  let epsCagrAdjustedWindow = false;
  if (curInc && curInc.eps > 0) {
    if (baseInc && baseInc.eps > 0) {
      epsCagr = cagrPct(curInc.eps, baseInc.eps, yearsBack);
    } else {
      let fallbackIdx: number | null = null;
      for (let i = curIdx - 1; i >= 0; i--) {
        if (inc[i].eps > 0) {
          fallbackIdx = i;
          break;
        }
      }
      if (fallbackIdx != null) {
        epsCagrYearsBack = curIdx - fallbackIdx;
        epsCagr = cagrPct(curInc.eps, inc[fallbackIdx].eps, epsCagrYearsBack);
        epsCagrAdjustedWindow = true;
      }
    }
  }

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
    }, plus the most recent single year's revenue growth as a momentum check. Revenue CAGR is left blank whenever the start or end year had non-positive revenue. EPS CAGR widens its window back to the nearest earlier profitable year if the naive window's start year had a loss (labeled "adjusted window" when this happens), but is still left blank if the CURRENT year has a loss, since growth into a loss isn't a meaningful percentage.`,
    items: [
      { label: `Revenue CAGR (${yearsBack || 1}Y)`, displayValue: fmtPct(revCagr), score: revCagrScore },
      {
        label: `EPS CAGR (${epsCagrYearsBack || 1}Y${epsCagrAdjustedWindow ? ", adjusted window" : ""})`,
        displayValue: fmtPct(epsCagr),
        score: epsCagrScore,
      },
      { label: "Revenue Growth (YoY)", displayValue: fmtPct(revGrowthYoY), score: revGrowthYoYScore },
    ],
  };

  // --- Valuation: growth-adjusted AND intrinsic-value-aware — see
  // score.ts's computeValuationScore doc comment for the full recalibration
  // rationale. Growth-adjustment history: MSFT and AMZN both scored a flat
  // 5/10 here under the original fixed-cutoff logic despite ~18-20% and
  // ~16-30% growth respectively (fixed, now 7/10 and 8/10 on growth-
  // adjustment alone). Intrinsic-value integration (this pass): MSFT's Fair
  // Value Estimate card showed "Significantly Undervalued" / -20.4%
  // discount at the SAME TIME this pillar still showed a mediocre 6/10 —
  // the two were computed independently with no way to agree with each
  // other. `fairValueDiscountPct` (fair-value.ts's premiumDiscountPct,
  // computed once by the caller — see ScorePanel.tsx) now carries the
  // single largest weight of any Valuation sub-score, so a stock this app's
  // own intrinsic-value model already flags as significantly underpriced
  // can no longer be simultaneously scored as mediocre here. Growth rate
  // uses the Growth pillar's own multi-year EPS CAGR (falling back to the
  // single-year YoY figure), since that's the more representative,
  // less-noisy signal this file already computes for its Growth pillar —
  // score.ts's own composite score uses its own YoY figure instead, since
  // it doesn't compute a multi-year CAGR of its own.
  const valuationResult = computeValuationScore({
    peRatio: metrics.financials.peRatio,
    forwardPeg: metrics.financials.forwardPeg,
    priceToCashFlow: metrics.financials.priceToCashFlow,
    freeCashFlowYield: metrics.yields.freeCashFlowYield,
    cashFlowYield: metrics.yields.cashFlowYield,
    growthRatePct: epsCagr ?? revGrowthYoY,
    fairValueDiscountPct,
  });
  const valuationScore = valuationResult.score;
  const valuationRank = rankFromScore(valuationScore);
  const valuation: GuruPillar = {
    name: "Valuation",
    rank: valuationRank,
    explanation:
      "How cheap the stock looks across five signals at once: four independent multiples/yields, each adjusted for growth (a higher sustainable growth rate justifies a higher P/E, Price/Cash-Flow, and lower FCF yield — the standard 'growth premium'), plus this app's own Fair Value Estimate discount/premium (see the band below), which now carries the single largest weight of the five so this rank can't contradict that card. GuruFocus's real GF Value line is a proprietary fair-value regression against historical median multiples and analyst estimates — not something this app can reproduce without their model; the Fair Value Estimate below is Stox's own independently-derived approximation instead.",
    items: valuationResult.items,
  };

  // --- Momentum: trailing 1/6/12-month price return, higher is better.
  // GuruFocus's own Momentum rank additionally divides these returns by
  // the stock's beta (volatility relative to the market) — this app
  // doesn't compute a market beta anywhere (no benchmark index return
  // series is fetched for any ticker), so these are raw, not
  // beta-adjusted, trailing returns. Day counts (22/126/252) mirror the
  // same 1M/6M/1Y trading-day approximations ChartPanel.tsx already uses
  // for its own time-range slicing.
  const return1M = trailingReturnPct(history, 22);
  const return6M = trailingReturnPct(history, 126);
  const return12M = trailingReturnPct(history, 252);
  const return1MScore = scaleScore(return1M, -15, 15);
  const return6MScore = scaleScore(return6M, -25, 25);
  const return12MScore = scaleScore(return12M, -30, 40);
  const momentumScore = average([return1MScore, return6MScore, return12MScore]);
  const momentum: GuruPillar = {
    name: "Momentum",
    rank: rankFromScore(momentumScore),
    explanation:
      "Trailing price return over the last 1, 6, and 12 months. GuruFocus's own Momentum rank additionally divides these returns by the stock's beta (volatility relative to the market) — this app doesn't compute a market beta for any ticker, so these are raw (not beta-adjusted) trailing returns instead.",
    items: [
      { label: "1-Month Return", displayValue: fmtPct(return1M), score: return1MScore },
      { label: "6-Month Return", displayValue: fmtPct(return6M), score: return6MScore },
      { label: "12-Month Return", displayValue: fmtPct(return12M), score: return12MScore },
    ],
  };

  const pillars = [financialStrength, profitability, growth, valuation, momentum];
  // Recomputed straight from each pillar's own 0-100 score (not from the
  // already-rounded 1-10 ranks below), so the overall figure doesn't
  // compound two separate rounding passes.
  const overallScore = average([
    financialStrengthScore,
    profitabilityScore,
    growthScore,
    valuationScore,
    momentumScore,
  ]);
  const overallRank = rankFromScore(overallScore);

  return {
    overallRank,
    overallLabel: overallLabelFromRank(overallRank),
    pillars,
    valuationLabel: valuationLabelFromRank(valuationRank),
    overallScore,
  };
}
