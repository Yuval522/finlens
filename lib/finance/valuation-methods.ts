import { splitTrailingRow } from "./chart-transform";
import { toDisplayUnit } from "../format/currency";
import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear, PricePoint } from "./types";
import type { FairValueBandResult } from "./fair-value";

/**
 * Multi-method valuation comparison for the Score tab's Valuation view —
 * companion to fair-value.ts's single blended "Fair Value (Historical
 * Multiple)" figure and valuation-history.ts's time series, laying several
 * independent, publicly-documented per-share valuation formulas side by
 * side against the current price: Graham Number and Peter Lynch's growth
 * heuristic (both decades-old public-domain formulas from Benjamin
 * Graham's and Peter Lynch's own published books, not GuruFocus IP), book
 * value per share, a growth-adjusted historical P/FCF multiple, the same
 * growth-adjusted historical P/S multiple fair-value.ts already computes,
 * and a simplified two-stage earnings DCF with fully disclosed
 * assumptions. None of this reproduces GuruFocus's own proprietary
 * formulas; not affiliated with, endorsed by, or sourced from GuruFocus
 * LLC. Every figure here is a mechanical formula output, not investment
 * advice.
 *
 * Deliberately reuses fair-value.ts's already-computed FairValueBandResult
 * (medianHistoricalPS, growthAdjustmentFactor, epsCagrPct) rather than
 * re-deriving its own medians/growth rate from scratch — keeps every
 * valuation figure shown in this tab consistent with the number already
 * shown in the spectrum bar above it, instead of silently producing a
 * second, slightly-different "fair value" from an independent calculation
 * a user would have no way to reconcile.
 */

export interface ValuationMethodResult {
  key: string;
  label: string;
  /** Display units, reportingCurrency — null when this method can't be computed from available data. */
  value: number | null;
  tone: "good" | "ok" | "bad" | "none";
  /** Short caveat shown in the tooltip, e.g. methodology/data-limitation notes. */
  note?: string;
}

export interface ValuationMethodsResult {
  methods: ValuationMethodResult[];
  /** Display units, quoteCurrency — null when no live quote is available. */
  currentPrice: number | null;
  reportingCurrency: string;
  quoteCurrency: string;
  currencyDiffers: boolean;
}

// Simplified two-stage earnings DCF assumptions — fully disclosed here and
// surfaced in the UI tooltip/note rather than buried, since a DCF's output
// is extremely sensitive to these two numbers. 9%/3% are conventional
// textbook defaults (roughly a broad-market discount rate and a
// long-run-GDP-ish terminal growth rate), not fitted to any particular
// company.
const DISCOUNT_RATE = 0.09;
const TERMINAL_GROWTH = 0.03;
const PROJECTION_YEARS = 5;
const PRICE_MATCH_TOLERANCE_DAYS = 45;

function fiscalYearEndDate(fiscalYear: string): Date | null {
  const year = Number(fiscalYear);
  return Number.isFinite(year) ? new Date(year, 11, 31) : null;
}

/** Same "running best-by-diff" linear scan as fair-value.ts's own findClosestPricePoint. */
function findClosestPricePoint(history: PricePoint[], target: Date, toleranceDays: number): PricePoint | null {
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
  const targetMs = target.getTime();
  let best: { point: PricePoint; diff: number } | null = null;
  for (const point of history) {
    const diff = Math.abs(new Date(point.date).getTime() - targetMs);
    if (diff > toleranceMs) continue;
    if (!best || diff < best.diff) best = { point, diff };
  }
  return best?.point ?? null;
}

function median(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0);
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function tone(value: number | null, currentPrice: number | null): "good" | "ok" | "bad" | "none" {
  if (value == null || currentPrice == null) return "none";
  if (currentPrice < value * 0.95) return "good";
  if (currentPrice > value * 1.05) return "bad";
  return "ok";
}

/** Classic Benjamin Graham formula: sqrt(22.5 x EPS x book value/share) — the 22.5 constant comes from Graham's own stated ceilings of P/E<=15 and P/B<=1.5 (15 x 1.5 = 22.5). */
function computeGrahamNumber(eps: number, bookValuePerShare: number): number | null {
  if (eps <= 0 || bookValuePerShare <= 0) return null;
  return Math.sqrt(22.5 * eps * bookValuePerShare);
}

/** Classic Peter Lynch heuristic from "One Up on Wall Street": a fairly-priced growth stock's P/E should roughly equal its growth rate (PEG = 1). Skipped (null) when trailing growth isn't positive — the heuristic isn't meaningful for a shrinking-earnings company. Growth is capped at 30 so one outlier high-growth year can't imply an absurd multiple. */
function computePeterLynchValue(eps: number, growthPct: number | null): number | null {
  if (eps <= 0 || growthPct == null || growthPct <= 0) return null;
  const cappedGrowth = Math.min(30, growthPct);
  return eps * cappedGrowth;
}

/** Simplified two-stage DCF using EPS as the owner-cash-flow proxy: 5 years of explicit growth (bounded to +-15%/yr so one extreme historical year can't blow up the projection), then a Gordon-growth terminal value, both discounted at DISCOUNT_RATE. */
function computeEarningsDCF(eps: number, growthPct: number | null): number | null {
  if (eps <= 0 || DISCOUNT_RATE <= TERMINAL_GROWTH) return null;
  const g = Math.min(0.15, Math.max(-0.1, (growthPct ?? 0) / 100));
  let presentValue = 0;
  let projectedEps = eps;
  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    projectedEps *= 1 + g;
    presentValue += projectedEps / Math.pow(1 + DISCOUNT_RATE, year);
  }
  const terminalValue = (projectedEps * (1 + TERMINAL_GROWTH)) / (DISCOUNT_RATE - TERMINAL_GROWTH);
  presentValue += terminalValue / Math.pow(1 + DISCOUNT_RATE, PROJECTION_YEARS);
  return presentValue;
}

interface ComputeValuationMethodsInput {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  history: PricePoint[];
  quotePrice: number | null;
  quoteCurrency: string;
  reportingCurrency: string;
  fairValue: FairValueBandResult | null;
}

export function computeValuationMethods({
  income,
  balance,
  cashFlow,
  history,
  quotePrice,
  quoteCurrency,
  reportingCurrency,
  fairValue,
}: ComputeValuationMethodsInput): ValuationMethodsResult | null {
  const { historical: incHistorical, trailing: incTrailing } = splitTrailingRow(income);
  const { historical: balHistorical, trailing: balTrailing } = splitTrailingRow(balance);
  const { historical: cfHistorical, trailing: cfTrailing } = splitTrailingRow(cashFlow);

  // "Current" row picked independently per statement (trailing TTM/MRQ
  // preferred, else the latest historical row) — same convention already
  // established by score.ts/score-gurufocus.ts for combining figures
  // across income/balance/cashFlow, which doesn't require the three
  // statements to share identical fiscal-year coverage.
  const curInc = incTrailing ?? incHistorical[incHistorical.length - 1] ?? null;
  const curBal = balTrailing ?? balHistorical[balHistorical.length - 1] ?? null;
  const curCf = cfTrailing ?? cfHistorical[cfHistorical.length - 1] ?? null;
  if (!curInc) return null;

  const currentPrice = quotePrice != null ? toDisplayUnit(quotePrice, quoteCurrency) : null;
  const growthPct = fairValue?.epsCagrPct ?? null;
  const growthAdjustmentFactor = fairValue?.growthAdjustmentFactor ?? 1;

  // Growth-adjusted historical median P/FCF — same window/tolerance/median
  // convention as fair-value.ts's own P/E and P/S loop, just for
  // free-cash-flow-per-share instead. Matched to cashFlow by fiscalYear
  // label rather than array index, since income/cashFlow arrays aren't
  // guaranteed identical length or year coverage (see aggregate.ts).
  const cfByYear = new Map(cfHistorical.map((row) => [row.fiscalYear, row]));
  const pfcfSamples: number[] = [];
  for (const row of incHistorical.slice(-10)) {
    const cfRow = cfByYear.get(row.fiscalYear);
    if (!cfRow || cfRow.freeCashFlow <= 0 || row.sharesOutstandingDiluted <= 0) continue;
    const yearEnd = fiscalYearEndDate(row.fiscalYear);
    if (!yearEnd) continue;
    const pricePoint = findClosestPricePoint(history, yearEnd, PRICE_MATCH_TOLERANCE_DAYS);
    if (!pricePoint) continue;
    const priceDisplay = toDisplayUnit(pricePoint.close, quoteCurrency);
    pfcfSamples.push(priceDisplay / (cfRow.freeCashFlow / row.sharesOutstandingDiluted));
  }
  const medianHistoricalPFCF = median(pfcfSamples);
  const adjMedianPFCF = medianHistoricalPFCF != null ? medianHistoricalPFCF * growthAdjustmentFactor : null;

  const bookValuePerShare =
    curBal && curBal.totalStockholdersEquity > 0 && curInc.sharesOutstandingDiluted > 0
      ? curBal.totalStockholdersEquity / curInc.sharesOutstandingDiluted
      : null;

  const fcfPerShare =
    curCf && curCf.freeCashFlow > 0 && curInc.sharesOutstandingDiluted > 0
      ? curCf.freeCashFlow / curInc.sharesOutstandingDiluted
      : null;

  const revenuePerShare =
    curInc.totalRevenue > 0 && curInc.sharesOutstandingDiluted > 0
      ? curInc.totalRevenue / curInc.sharesOutstandingDiluted
      : null;

  const projectedFcfValue = adjMedianPFCF != null && fcfPerShare != null ? adjMedianPFCF * fcfPerShare : null;
  const medianPsValue =
    fairValue?.medianHistoricalPS != null && revenuePerShare != null
      ? fairValue.medianHistoricalPS * growthAdjustmentFactor * revenuePerShare
      : null;
  const grahamValue = bookValuePerShare != null ? computeGrahamNumber(curInc.eps, bookValuePerShare) : null;
  const peterLynchValue = computePeterLynchValue(curInc.eps, growthPct);
  const dcfValue = computeEarningsDCF(curInc.eps, growthPct);

  const methods: ValuationMethodResult[] = [
    {
      key: "fairValue",
      label: "Fair Value (Historical Multiple)",
      value: fairValue?.fairValue ?? null,
      tone: tone(fairValue?.fairValue ?? null, currentPrice),
      note: "Same growth-adjusted historical P/E and P/S blend shown in the Fair Value Estimate above.",
    },
    {
      key: "bookValue",
      label: "Book Value / Share",
      value: bookValuePerShare,
      tone: tone(bookValuePerShare, currentPrice),
      note: "Total stockholders' equity per share — not tangible-adjusted, since a goodwill/intangibles breakdown isn't available from this app's data providers.",
    },
    {
      key: "projectedFcf",
      label: "Projected FCF Value",
      value: projectedFcfValue,
      tone: tone(projectedFcfValue, currentPrice),
      note: "Growth-adjusted historical median Price/FCF multiple applied to current free-cash-flow-per-share.",
    },
    {
      key: "medianPs",
      label: "Median P/S Value",
      value: medianPsValue,
      tone: tone(medianPsValue, currentPrice),
      note: "Growth-adjusted historical median Price/Sales multiple applied to current revenue-per-share.",
    },
    {
      key: "graham",
      label: "Graham Number",
      value: grahamValue,
      tone: tone(grahamValue, currentPrice),
      note: "Benjamin Graham's classic formula: sqrt(22.5 x EPS x book value/share).",
    },
    {
      key: "peterLynch",
      label: "Peter Lynch Value",
      value: peterLynchValue,
      tone: tone(peterLynchValue, currentPrice),
      note: "Peter Lynch's PEG=1 heuristic: fair P/E equals the EPS growth rate. Skipped when trailing EPS growth isn't positive.",
    },
    {
      key: "dcfEarnings",
      label: "DCF (Earnings Based)",
      value: dcfValue,
      tone: tone(dcfValue, currentPrice),
      note: `Two-stage DCF: ${PROJECTION_YEARS}-year EPS growth (capped +-15%/yr), ${(DISCOUNT_RATE * 100).toFixed(0)}% discount rate, ${(TERMINAL_GROWTH * 100).toFixed(0)}% terminal growth.`,
    },
  ];

  return {
    methods,
    currentPrice,
    reportingCurrency,
    quoteCurrency,
    currencyDiffers: quoteCurrency !== reportingCurrency,
  };
}
