import { splitTrailingRow } from "./chart-transform";
import { toDisplayUnit } from "../format/currency";
import type { IncomeStatementYear, PricePoint } from "./types";
import type { FairValueBandResult } from "./fair-value";

/**
 * Historical "fair value line" for the Valuation view's band chart —
 * companion to fair-value.ts's single-point computeFairValueBand. FinLens's
 * own approximation of the *shape* of GuruFocus's GF Value history chart (a
 * smoothed fair-value line plotted against price, with percentage
 * over/undervalued bands) — not a reproduction of their proprietary
 * regression. Not affiliated with, endorsed by, or sourced from GuruFocus
 * LLC. Not investment advice.
 *
 * Deliberately reuses fair-value.ts's already-computed FairValueBandResult
 * (medianHistoricalPE/PS, growthAdjustmentFactor, epsCagrPct, currentPrice)
 * rather than re-deriving its own medians — this file is purely a
 * "projector" that applies those same already-computed multiples across
 * every fiscal year to build a time series, guaranteeing the "today" point
 * on this chart always agrees with the Fair Value Estimate spectrum bar
 * shown above it in the Score tab, rather than silently producing a second,
 * slightly different number from an independent recomputation.
 *
 * Methodology:
 *  1. Apply the SAME growth-adjusted P/E and P/S multiples fair-value.ts
 *     already computed to EVERY historical fiscal year's own EPS/
 *     revenue-per-share, producing one fair-value "anchor" per fiscal
 *     year-end date, plus one anchor for the trailing/latest period
 *     anchored at the most recent price date ("today").
 *  2. One further anchor is projected ~1 year beyond "today" by growing
 *     EPS/revenue at the same bounded CAGR fair-value.ts computed —
 *     mirroring GuruFocus's own chart convention of extending the
 *     fair-value line slightly into the future (rendered dashed).
 *  3. Daily fair value is linearly interpolated between anchors (flat
 *     before the first / after the last), so the plotted line is smooth
 *     rather than a step function.
 *  4. Bands are +-10%/+-30% of that day's own fair value, per this
 *     chart's own spec — a deliberately different tiering from the +-20%
 *     single band used by the Score tab's spectrum bar (fair-value.ts),
 *     kept local to the presentational chart component rather than
 *     changing that already-shipped widget's band width.
 */

export interface FairValueHistoryPoint {
  date: string;
  /** Display units, quoteCurrency — null for projected dates beyond the real price history. */
  price: number | null;
  /** Display units, reportingCurrency — the interpolated fair value at this date, whether historical or projected. */
  fairValue: number | null;
  /** Same as fairValue but null on projected points (for rendering a solid line that stops at "today"). */
  fairValueActual: number | null;
  /** Same as fairValue but null on historical points except the very last one (the bridge point, so the dashed projected line visually connects to the solid one). */
  fairValueProjected: number | null;
  projected: boolean;
}

export interface FairValueHistoryResult {
  points: FairValueHistoryPoint[];
  /** Display units, reportingCurrency. */
  currentFairValue: number | null;
  /** Display units, quoteCurrency — from FairValueBandResult.currentPrice (the live quote), not just the last daily close. */
  currentPrice: number | null;
  premiumDiscountPct: number | null;
  label: string;
  currencyDiffers: boolean;
  reportingCurrency: string;
  quoteCurrency: string;
}

const MAX_POINTS = 260;
const FUTURE_STEPS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function fiscalYearEndDate(fiscalYear: string): Date | null {
  const year = Number(fiscalYear);
  return Number.isFinite(year) ? new Date(year, 11, 31) : null;
}

function blend(a: number | null, b: number | null): number | null {
  const present = [a, b].filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

function labelFromPremiumDiscount(pct: number | null): string {
  if (pct == null) return "—";
  if (pct <= -30) return "Significantly Undervalued";
  if (pct <= -10) return "Modestly Undervalued";
  if (pct < 10) return "Fairly Valued";
  if (pct < 30) return "Modestly Overvalued";
  return "Significantly Overvalued";
}

interface Anchor {
  time: number;
  value: number;
}

function interpolate(anchors: Anchor[], time: number): number | null {
  if (anchors.length === 0) return null;
  if (time <= anchors[0].time) return anchors[0].value;
  const last = anchors[anchors.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

interface ComputeFairValueHistoryInput {
  income: IncomeStatementYear[];
  history: PricePoint[];
  quoteCurrency: string;
  reportingCurrency: string;
  fairValue: FairValueBandResult | null;
}

export function computeFairValueHistory({
  income,
  history,
  quoteCurrency,
  reportingCurrency,
  fairValue,
}: ComputeFairValueHistoryInput): FairValueHistoryResult | null {
  if (!fairValue || history.length === 0) return null;
  const { historical, trailing } = splitTrailingRow(income);
  if (historical.length === 0) return null;

  const adjMedianPE =
    fairValue.medianHistoricalPE != null ? fairValue.medianHistoricalPE * fairValue.growthAdjustmentFactor : null;
  const adjMedianPS =
    fairValue.medianHistoricalPS != null ? fairValue.medianHistoricalPS * fairValue.growthAdjustmentFactor : null;
  if (adjMedianPE == null && adjMedianPS == null) return null;

  function fairValueFor(eps: number, totalRevenue: number, shares: number): number | null {
    const fromPE = adjMedianPE != null && eps > 0 ? adjMedianPE * eps : null;
    const fromPS = adjMedianPS != null && totalRevenue > 0 && shares > 0 ? adjMedianPS * (totalRevenue / shares) : null;
    return blend(fromPE, fromPS);
  }

  const window = historical.slice(-10);
  const anchors: Anchor[] = [];
  for (const row of window) {
    const date = fiscalYearEndDate(row.fiscalYear);
    const value = fairValueFor(row.eps, row.totalRevenue, row.sharesOutstandingDiluted);
    if (date && value != null) anchors.push({ time: date.getTime(), value });
  }

  const currentRow = trailing ?? window[window.length - 1] ?? null;
  const lastPriceDate = new Date(history[history.length - 1].date).getTime();
  const currentValue = currentRow
    ? fairValueFor(currentRow.eps, currentRow.totalRevenue, currentRow.sharesOutstandingDiluted)
    : null;
  if (currentValue != null) {
    anchors.push({ time: lastPriceDate, value: currentValue });
  }

  anchors.sort((a, b) => a.time - b.time);
  // Dedupe same-timestamp anchors, keeping the later-pushed (more specific,
  // i.e. the "today" anchor over a fiscal-year-end one that happens to
  // land on the same day) value.
  const dedupedAnchors: Anchor[] = [];
  for (const anchor of anchors) {
    if (dedupedAnchors.length > 0 && dedupedAnchors[dedupedAnchors.length - 1].time === anchor.time) {
      dedupedAnchors[dedupedAnchors.length - 1] = anchor;
    } else {
      dedupedAnchors.push(anchor);
    }
  }
  if (dedupedAnchors.length === 0) return null;

  // One projected anchor ~1 year past the last price date, growing EPS/
  // revenue by the same bounded CAGR fair-value.ts already computed —
  // matches GuruFocus's own chart convention of extending the fair-value
  // line slightly into the future. Revenue is approximated as growing at
  // the same rate as EPS (this codebase doesn't compute a separate revenue
  // CAGR anywhere to reuse instead) — a disclosed simplification.
  let projectedAnchor: Anchor | null = null;
  if (currentRow) {
    const g = Math.min(0.2, Math.max(-0.2, (fairValue.epsCagrPct ?? 0) / 100));
    const projectedEps = currentRow.eps * (1 + g);
    const projectedRevenue = currentRow.totalRevenue * (1 + g);
    const projectedValue = fairValueFor(projectedEps, projectedRevenue, currentRow.sharesOutstandingDiluted);
    if (projectedValue != null) {
      projectedAnchor = { time: lastPriceDate + 365 * MS_PER_DAY, value: projectedValue };
    }
  }

  const allAnchors = projectedAnchor ? [...dedupedAnchors, projectedAnchor] : dedupedAnchors;

  // Downsample daily history to at most MAX_POINTS for chart performance —
  // this is an interpolated fair-value line plotted against price, not a
  // precision trading chart (see PriceChart.tsx / lightweight-charts for
  // that), so weekly-ish granularity over a 5-10 year window looks
  // identical while rendering far fewer DOM nodes.
  const stride = Math.max(1, Math.ceil(history.length / MAX_POINTS));
  const sampled: PricePoint[] = [];
  for (let i = 0; i < history.length; i += stride) sampled.push(history[i]);
  if (sampled[sampled.length - 1] !== history[history.length - 1]) sampled.push(history[history.length - 1]);

  const points: FairValueHistoryPoint[] = sampled.map((p, idx) => {
    const time = new Date(p.date).getTime();
    const fv = interpolate(dedupedAnchors, time);
    const isLastActual = idx === sampled.length - 1;
    return {
      date: p.date,
      price: toDisplayUnit(p.close, quoteCurrency),
      fairValue: fv,
      fairValueActual: fv,
      fairValueProjected: isLastActual ? fv : null,
      projected: false,
    };
  });

  if (projectedAnchor) {
    const startTime = lastPriceDate;
    const endTime = projectedAnchor.time;
    for (let step = 1; step <= FUTURE_STEPS; step++) {
      const t = startTime + ((endTime - startTime) * step) / FUTURE_STEPS;
      const fv = interpolate(allAnchors, t);
      points.push({
        date: new Date(t).toISOString().slice(0, 10),
        price: null,
        fairValue: fv,
        fairValueActual: null,
        fairValueProjected: fv,
        projected: true,
      });
    }
  }

  const currentPrice = fairValue.currentPrice;
  const premiumDiscountPct =
    currentPrice != null && currentValue != null ? ((currentPrice - currentValue) / currentValue) * 100 : null;

  return {
    points,
    currentFairValue: currentValue,
    currentPrice,
    premiumDiscountPct,
    label: labelFromPremiumDiscount(premiumDiscountPct),
    currencyDiffers: quoteCurrency !== reportingCurrency,
    reportingCurrency,
    quoteCurrency,
  };
}
