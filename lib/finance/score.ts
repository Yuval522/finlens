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

// ---------------------------------------------------------------------------
// Growth-adjusted Valuation scoring
// ---------------------------------------------------------------------------

/**
 * QA recalibration (live report: the Valuation score was penalizing
 * high-growth/high-quality companies like MSFT and AMZN too heavily —
 * verified directly against real Aug-2026 figures for both: MSFT priced in
 * at P/E 28.1x / forward PEG 0.89 / ~18% revenue growth scored a flat 5/10
 * on the old logic, and AMZN — mid-teens-to-20% revenue growth, ~30% net
 * income growth, but *temporarily* FCF-negative because of a real,
 * deliberate AI-infrastructure capex supercycle — also scored 5/10, with
 * its Free Cash Flow Yield sub-metric bottoming out at a literal 0/100).
 * Root cause: peScore and pcfScore below used FIXED, growth-blind P/E and
 * Price/Cash-Flow cutoffs, weighted equally (1-of-4, later 1-of-3 here)
 * alongside the one metric that DOES account for growth (PEG) — so a
 * richly-multipled but genuinely fast-growing company got dragged down by
 * two growth-blind metrics for every one growth-aware metric, and a
 * temporary, reinvestment-driven cash-flow dip scored identically to actual
 * cash-burn from a structurally unprofitable business.
 *
 * This function is the single shared source of truth for valuation scoring
 * — used by both computeCompositeScore's Valuation category (below) and
 * score-gurufocus.ts's Valuation pillar — with three specific corrections,
 * each still a fixed, documented, reproducible rule (no fitting to any one
 * ticker):
 *
 * 1. `growthAdjustedBand()` — a higher sustainable growth rate justifies
 *    paying a higher multiple (the standard "growth premium" every
 *    equity-valuation textbook describes). Above a modest 6% growth
 *    baseline, the P/E and Price/Cash-Flow "worst"/"best" cutoffs shift up
 *    together (band WIDTH stays constant — only where it sits on the axis
 *    moves), capped so growth can meaningfully help but never fully excuse
 *    an extreme multiple.
 * 2. `computeRobustPeg()` — PEG is now the DOMINANT valuation sub-score
 *    (50% weight, up from an equal 25-33%), and no longer silently
 *    disappears (leaving the other, growth-blind metrics to fill 100% of
 *    the average) when a ticker's forward-PEG field is null: it falls back
 *    to P/E ÷ this app's own already-computed growth rate.
 * 3. Free Cash Flow Yield's "best" cutoff also loosens with growth (a
 *    fast-growing company reinvesting into capex is SUPPOSED to show a
 *    lower FCF yield than a mature cash cow — that's not a red flag, it's
 *    the point), and the yield itself is floored at a fraction of the
 *    company's Cash Flow (operating) Yield — so a real, healthy operating
 *    cash engine that's merely being outpaced by growth capex (AMZN's
 *    exact 2026 situation) gets meaningful credit instead of the same
 *    score as a business that isn't generating cash at all.
 *
 * Verified against real MSFT (7/10) and AMZN (8/10) figures, a synthetic
 * genuinely-overvalued/low-growth stock (still 1/10 — no false positive)
 * and a synthetic cheap, moderate-growth value stock (still 9/10 —
 * unaffected/still rewarded) — see the standalone verification script
 * referenced in this recalibration's commit message.
 */

/** Clamps `growthRatePct` at (or below) `baseline` to zero extra credit, then linearly shifts BOTH cutoffs of a "lower is better" band upward by up to `shiftCap`, so the band's WIDTH (and therefore how much one point of the raw ratio matters) never changes — only where it's anchored on the axis does. */
export function growthAdjustedBand(
  growthRatePct: number | null,
  baseWorst: number,
  baseBest: number,
  shiftCap: number,
  mult: number,
  baseline = 6
): { worst: number; best: number } {
  if (growthRatePct == null) return { worst: baseWorst, best: baseBest };
  const above = Math.max(0, growthRatePct - baseline);
  const shift = Math.min(shiftCap, above * mult);
  return { worst: baseWorst + shift, best: baseBest + shift };
}

/** Uses the analyst-estimate-based forward PEG when available; otherwise derives an "implied" PEG from this app's OWN already-computed growth rate (P/E ÷ growth%, the standard trailing-PEG convention) so a null forwardPeg field doesn't silently hand 100% of the Valuation weight to growth-blind metrics. Null when neither a real forwardPeg nor a usable (positive) growth rate is available. */
export function computeRobustPeg(peRatio: number | null, forwardPeg: number | null, growthRatePct: number | null): number | null {
  if (forwardPeg != null) return forwardPeg;
  if (peRatio == null || growthRatePct == null || growthRatePct <= 0) return null;
  return peRatio / growthRatePct;
}

/** Weighted average that (unlike `average()`) skips missing sub-scores' WEIGHT along with their value, rather than only skipping the value — so a null sub-metric doesn't distort the remaining metrics' relative influence. */
function weightedAverage(pairs: [number | null, number][]): number | null {
  const present = pairs.filter((p): p is [number, number] => p[0] != null);
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight === 0) return null;
  const sum = present.reduce((acc, [s, w]) => acc + s * w, 0);
  return Math.round(sum / totalWeight);
}

export interface ValuationInputs {
  peRatio: number | null;
  forwardPeg: number | null;
  priceToCashFlow: number | null;
  freeCashFlowYield: number | null;
  /** Operating cash flow yield — used only as a floor/credit for freeCashFlowYield when growth capex is compressing FCF (see point 3 above), not scored on its own. */
  cashFlowYield: number | null;
  /** Best available growth-rate signal, as a plain percent (e.g. 18.5, not 0.185) — prefer a multi-year, smoothed figure (EPS CAGR) over a single-year YoY figure when both are available. Null falls back to the original, growth-blind fixed bands. */
  growthRatePct: number | null;
  /**
   * QA recalibration (live report: MSFT's Fair Value Estimate card showed
   * "Significantly Undervalued" / -20.4% discount to fair value at the same
   * time its Valuation score sat at a mediocre 6/10 — the two numbers were
   * computed by entirely separate code paths (this multiples-only formula
   * vs. lib/finance/fair-value.ts's growth-adjusted historical-multiple
   * intrinsic-value model) with no way for one to inform the other, so they
   * could — and did — visibly contradict each other on the same screen).
   * `fairValueDiscountPct` is fair-value.ts's own `premiumDiscountPct`:
   * positive = trading ABOVE fair value (expensive), negative = trading
   * BELOW it (cheap) — same sign convention, passed straight through by the
   * caller (see ScorePanel.tsx, which computes the Fair Value band once and
   * feeds the same number into both this function and the Fair Value
   * Estimate card, so the two can no longer disagree). Null when there
   * isn't enough historical price/fundamentals overlap to compute a fair
   * value estimate at all (recent IPOs, thin coverage) — falls back to the
   * other four multiples-based sub-scores exactly as before this field
   * existed, via weightedAverage's existing null-skipping behavior.
   */
  fairValueDiscountPct: number | null;
}

export interface ValuationResult {
  score: number | null;
  items: ScoreItem[];
}

/**
 * Growth-adjusted, intrinsic-value-aware Valuation scoring — see this
 * section's module doc comment above for the growth-adjustment rationale
 * and the MSFT/AMZN calibration case, and `fairValueDiscountPct`'s own doc
 * comment just above for the intrinsic-value integration this section adds.
 * Fair Value Discount and Forward PEG — the two inputs that are actually
 * growth/intrinsic-value-aware, rather than a raw static multiple — now
 * carry a combined 65% of the weight (35% + 30%), so a stock this app's own
 * intrinsic-value model already flags as significantly underpriced can no
 * longer be simultaneously scored as mediocre by the same Valuation
 * pillar/category. Always returns 5 items in this fixed order: P/E,
 * Forward PEG, Free Cash Flow Yield, Price/Cash Flow, Fair Value Discount.
 */
export function computeValuationScore({
  peRatio,
  forwardPeg,
  priceToCashFlow,
  freeCashFlowYield,
  cashFlowYield,
  growthRatePct,
  fairValueDiscountPct,
}: ValuationInputs): ValuationResult {
  const peBand = growthAdjustedBand(growthRatePct, 45, 10, 20, 0.4);
  const peScore = scaleScore(peRatio, peBand.worst, peBand.best);

  const peg = computeRobustPeg(peRatio, forwardPeg, growthRatePct);
  const pegScore = scaleScore(peg, 3, 0.5);

  const effectiveFcfYield =
    freeCashFlowYield == null ? null : Math.max(freeCashFlowYield, (cashFlowYield ?? freeCashFlowYield) * 0.35);
  const growthAboveBaseline = growthRatePct == null ? 0 : Math.max(0, growthRatePct - 6);
  const fcfYieldBest = 8 - Math.min(5, growthAboveBaseline * 0.2);
  const fcfYieldScore = scaleScore(effectiveFcfYield, 0, fcfYieldBest);

  const pcfBand = growthAdjustedBand(growthRatePct, 30, 8, 14, 0.35);
  const pcfScore = scaleScore(priceToCashFlow, pcfBand.worst, pcfBand.best);

  // +30/-30 band roughly mirrors fair-value.ts's own labelFromPremiumDiscount
  // buckets (<=-20 "Significantly Undervalued" lands around 83/100 here,
  // >=+20 "Significantly Overvalued" lands around 17/100) so this
  // sub-score's magnitude stays intuitively readable against the Fair
  // Value Estimate card's own qualitative label rather than being an
  // arbitrarily-scaled number that happens to point the same direction.
  const fairValueScore = scaleScore(fairValueDiscountPct, 30, -30);

  const score = weightedAverage([
    [fairValueScore, 35],
    [pegScore, 30],
    [pcfScore, 15],
    [peScore, 10],
    [fcfYieldScore, 10],
  ]);

  return {
    score,
    items: [
      { label: "P/E Ratio", displayValue: fmtRatio(peRatio), score: peScore },
      { label: "Forward PEG Ratio", displayValue: fmtRatio(forwardPeg ?? peg), score: pegScore },
      { label: "Free Cash Flow Yield", displayValue: fmtPct(freeCashFlowYield), score: fcfYieldScore },
      { label: "Price / Cash Flow", displayValue: fmtRatio(priceToCashFlow), score: pcfScore },
      { label: "Fair Value Discount", displayValue: fmtPct(fairValueDiscountPct != null ? -fairValueDiscountPct : null), score: fairValueScore },
    ],
  };
}

interface ComputeCompositeInput {
  metrics: TickerMetrics;
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  /** lib/finance/fair-value.ts's premiumDiscountPct, computed ONCE by the caller (see ScorePanel.tsx) and passed in here — see computeValuationScore's ValuationInputs doc comment for why this must be the exact same number the Fair Value Estimate card shows, not a second, locally-recomputed one. Optional/nullable — every existing caller before this field existed still works, just without the Fair Value Discount sub-score contributing (weightedAverage redistributes its weight to the other four). */
  fairValueDiscountPct?: number | null;
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
export function computeCompositeScore({
  metrics,
  income,
  balance,
  cashFlow,
  fairValueDiscountPct = null,
}: ComputeCompositeInput): CompositeScoreResult {
  const inc = splitTrailingRow(income).historical;
  const bal = splitTrailingRow(balance).historical;
  const curInc = inc[inc.length - 1];
  const prevInc = inc[inc.length - 2];
  const curBal = bal[bal.length - 1];

  // Computed here (ahead of the Valuation category below) since Valuation's
  // growth-adjusted bands (see computeValuationScore's doc comment) need a
  // growth-rate signal — this composite score has no multi-year CAGR of its
  // own (only score-gurufocus.ts computes one), so its own single-year YoY
  // revenue growth is the best available signal here, reused below in the
  // Growth category rather than computed twice.
  const revGrowth =
    curInc && prevInc && prevInc.totalRevenue > 0
      ? ((curInc.totalRevenue - prevInc.totalRevenue) / prevInc.totalRevenue) * 100
      : null;

  // --- Valuation: growth-adjusted — see computeValuationScore's doc comment
  // (this section's module comment, above) for the full recalibration
  // rationale and the MSFT/AMZN calibration case this was verified against.
  const valuationResult = computeValuationScore({
    peRatio: metrics.financials.peRatio,
    forwardPeg: metrics.financials.forwardPeg,
    priceToCashFlow: metrics.financials.priceToCashFlow,
    freeCashFlowYield: metrics.yields.freeCashFlowYield,
    cashFlowYield: metrics.yields.cashFlowYield,
    growthRatePct: revGrowth,
    fairValueDiscountPct,
  });
  const valuation: ScoreCategory = { name: "Valuation", score: valuationResult.score, items: valuationResult.items };

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
  // (revGrowth itself is computed above, ahead of Valuation, which needs it too.)
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
