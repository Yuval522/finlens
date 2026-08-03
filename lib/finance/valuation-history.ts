import { splitTrailingRow } from "./chart-transform";
import { toDisplayUnit } from "../format/currency";
import type { IncomeStatementYear, PricePoint } from "./types";
import { normalizedCurrentValue, type FairValueBandResult } from "./fair-value";

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
 *     year-end date, plus one anchor for "today" anchored at the most
 *     recent price date, using fair-value.ts's own normalizedCurrentValue
 *     (TTM blended with the latest 1-2 fiscal years) — QA fix for a live
 *     audit that caught this chart's "today" point and the Fair Value
 *     Estimate card above it showing two DIFFERENT numbers for the same
 *     ticker: this file previously derived its "today" anchor from a
 *     single period (TTM, or the latest fiscal year) independently of
 *     fair-value.ts's own (separately fixed) smoothing, silently
 *     reintroducing exactly the kind of drift this file's shared-multiples
 *     design was meant to prevent. Reusing the same exported function for
 *     both keeps them locked together going forward.
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
 *
 * QA fix (live comparison flagged the chart "stretching wildly" for older
 * years, e.g. around a stock split): every anchor is now sanity-bounded
 * against a real nearby price rather than trusted blindly. The
 * growth-adjusted multiple was DERIVED from historical prices, so applying
 * it back to that same year's EPS/revenue should land in the same
 * ballpark as that year's real price — a wild divergence signals a
 * data-quality artifact for that one fiscal year (a unit-scale mismatch,
 * or a split reflected in the price history but not consistently in that
 * year's as-filed EPS/shares, etc.), not a genuine valuation signal.
 * Clamping (not dropping) that one anchor to a generous multiple of the
 * nearby real price keeps the line continuous without letting one bad
 * year's figure dominate the whole chart's Y-axis scale via linear
 * interpolation. Years with no nearby real price to check against are
 * skipped entirely instead — same requirement fair-value.ts's own
 * median-multiple sample loop already applies.
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
/** A "closest" price match beyond this window isn't a real fiscal-year-end price — same tolerance fair-value.ts uses for its own median-multiple sample loop. */
const PRICE_MATCH_TOLERANCE_DAYS = 45;
/** Sanity bounds for a per-year anchor relative to that year's own real price — generous (0.15x-6x) since a genuine multiple-derived fair value can legitimately diverge from price during e.g. a bubble or a crash year, but wide enough to still catch an order-of-magnitude data artifact. */
const ANCHOR_MIN_MULTIPLE = 0.15;
const ANCHOR_MAX_MULTIPLE = 6;

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

function clampToPrice(value: number, priceDisplay: number): number {
  return Math.min(priceDisplay * ANCHOR_MAX_MULTIPLE, Math.max(priceDisplay * ANCHOR_MIN_MULTIPLE, value));
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
    if (!date) continue;
    const pricePoint = findClosestPricePoint(history, date, PRICE_MATCH_TOLERANCE_DAYS);
    if (!pricePoint) continue;
    const rawValue = fairValueFor(row.eps, row.totalRevenue, row.sharesOutstandingDiluted);
    if (rawValue == null) continue;
    const priceDisplay = toDisplayUnit(pricePoint.close, quoteCurrency);
    anchors.push({ time: date.getTime(), value: clampToPrice(rawValue, priceDisplay) });
  }

  // Smoothed "today" basis — same normalizedCurrentValue helper
  // fair-value.ts uses for its own current-point calc (see this file's
  // module doc comment for why sharing this function matters).
  const recentHistoricalRows = window.slice(-2).reverse();
  const normalizationRows = [trailing, ...recentHistoricalRows];
  const normEps = normalizedCurrentValue(normalizationRows, (r) => r.eps);
  const normRevenuePerShare = normalizedCurrentValue(normalizationRows, (r) =>
    r.totalRevenue > 0 && r.sharesOutstandingDiluted > 0 ? r.totalRevenue / r.sharesOutstandingDiluted : NaN
  );
  const lastPricePoint = history[history.length - 1];
  const lastPriceDate = new Date(lastPricePoint.date).getTime();
  const lastPriceDisplay = toDisplayUnit(lastPricePoint.close, quoteCurrency);
  const fromPECurrent = adjMedianPE != null && normEps != null ? adjMedianPE * normEps : null;
  const fromPSCurrent = adjMedianPS != null && normRevenuePerShare != null ? adjMedianPS * normRevenuePerShare : null;
  const rawCurrentValue = blend(fromPECurrent, fromPSCurrent);
  const currentValue = rawCurrentValue != null ? clampToPrice(rawCurrentValue, lastPriceDisplay) : null;
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
  if (currentValue != null) {
    const g = Math.min(0.2, Math.max(-0.2, (fairValue.epsCagrPct ?? 0) / 100));
    const projectedEps = normEps != null ? normEps * (1 + g) : null;
    const projectedRevenuePerShare = normRevenuePerShare != null ? normRevenuePerShare * (1 + g) : null;
    const fromPEProjected = adjMedianPE != null && projectedEps != null ? adjMedianPE * projectedEps : null;
    const fromPSProjected =
      adjMedianPS != null && projectedRevenuePerShare != null ? adjMedianPS * projectedRevenuePerShare : null;
    const rawProjectedValue = blend(fromPEProjected, fromPSProjected);
    if (rawProjectedValue != null) {
      // Bounded relative to the "today" anchor rather than a real price
      // (there isn't one for a future date) — a 1-year projection at a
      // growth rate already capped at +-20% shouldn't plausibly land
      // outside 0.5x-2x of today's value either.
      const projectedValue = Math.min(currentValue * 2, Math.max(currentValue * 0.5, rawProjectedValue));
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
