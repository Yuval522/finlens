"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FairValueHistoryPoint, FairValueHistoryResult } from "@/lib/finance/valuation-history";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import { currencySymbol } from "@/lib/format/currency";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { cn } from "@/lib/utils";

interface FairValueHistoryChartProps {
  data: FairValueHistoryResult;
}

type Tone = "good" | "ok" | "bad" | "none";

/** +-10% tone buckets (this chart's own tiering — see valuation-history.ts's doc comment for why it differs from the Score tab's +-20% spectrum bar). */
function historyTone(pct: number | null): Tone {
  if (pct == null) return "none";
  if (pct <= -10) return "good";
  if (pct < 10) return "ok";
  return "bad";
}

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-400",
  ok: "text-amber-400",
  bad: "text-rose-400",
  none: "text-muted-foreground",
};

const TONE_BADGE: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  ok: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  none: "border-border bg-muted text-muted-foreground",
};

interface ChartRow {
  date: string;
  price: number | null;
  floor: number | null;
  bandDeepGreen: number | null;
  bandLightGreen: number | null;
  bandNeutral: number | null;
  bandLightRed: number | null;
  bandDeepRed: number | null;
  fairValueActual: number | null;
  fairValueProjected: number | null;
}

/** Recharts has no native "shaded band between two lines" primitive — the
 *  standard idiom is stacked <Area> segments whose values are the DELTA
 *  height of each band (not absolute prices), starting from a floor. Each
 *  day's bands are relative to THAT day's own fair value (not a fixed
 *  value), so the shaded zones rise/fall following the fair-value trend,
 *  matching the reference chart's look. */
function buildBands(point: FairValueHistoryPoint): ChartRow {
  const fv = point.fairValue;
  if (fv == null) {
    return {
      date: point.date,
      price: point.price,
      floor: null,
      bandDeepGreen: null,
      bandLightGreen: null,
      bandNeutral: null,
      bandLightRed: null,
      bandDeepRed: null,
      fairValueActual: point.fairValueActual,
      fairValueProjected: point.fairValueProjected,
    };
  }
  const floor = fv * 0.5;
  const b70 = fv * 0.7;
  const b90 = fv * 0.9;
  const b110 = fv * 1.1;
  const b130 = fv * 1.3;
  const top = fv * 1.5;
  return {
    date: point.date,
    price: point.price,
    floor,
    bandDeepGreen: b70 - floor,
    bandLightGreen: b90 - b70,
    bandNeutral: b110 - b90,
    bandLightRed: b130 - b110,
    bandDeepRed: top - b130,
    fairValueActual: point.fairValueActual,
    fairValueProjected: point.fairValueProjected,
  };
}

function formatAxisDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

/** Same index-based boundary-flip idiom as lib/format/chart.ts's own
 *  shouldFlipTooltip, just matched on `date` instead of `fiscalYear` —
 *  that helper is generic over `{ fiscalYear: string }[]` rows, which this
 *  chart's date-keyed rows don't have, so this is a small local variant
 *  rather than a shared cross-file dependency (same duplication
 *  convention already established elsewhere, e.g. fair-value.ts's own
 *  cagrPct doc comment). QA fix: this chart's tooltip previously had NO
 *  boundary-awareness at all (unlike every other chart panel in this
 *  codebase), so hovering the right ~40% of the chart — including right
 *  around the "Now" marker, exactly where a user is most likely to
 *  hover — grew the tooltip box off the right edge of its card/viewport. */
function shouldFlipHistoryTooltip(label: string | undefined, data: { date: string }[]): boolean {
  if (!label || data.length <= 1) return false;
  const index = data.findIndex((row) => row.date === label);
  return index >= 0 && index / (data.length - 1) > 0.6;
}

interface HistoryTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { payload?: ChartRow }[];
  currency: string;
  data: ChartRow[];
}

/** Passed as a JSX element (not a function) to `content` — same convention
 *  used by every other custom Recharts tooltip in this codebase (see
 *  ChartTooltip.tsx's doc comment). */
function HistoryTooltip({ active, label, payload, currency, data }: HistoryTooltipProps) {
  if (!active || !label || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fv = row.fairValueActual ?? row.fairValueProjected;
  const flip = shouldFlipHistoryTooltip(label, data);
  return (
    <div style={{ ...CHART_TOOLTIP_STYLE, transform: flip ? "translateX(-100%)" : undefined }}>
      <p className="mb-1.5 font-semibold text-foreground">{formatAxisDate(label)}</p>
      <div className="space-y-1">
        {row.price != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Price</span>
            <span className="font-medium text-foreground">
              {row.price.toFixed(2)} {currency}
            </span>
          </div>
        )}
        {fv != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Fair Value</span>
            <span className="font-medium text-foreground">{fv.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * GuruFocus-style "fair value history" band chart — historical price
 * plotted against the growth-adjusted, historical-multiple fair-value line
 * from lib/finance/valuation-history.ts, shaded in +-10%/+-30% bands.
 * FinLens's own approximation, not a reproduction of GuruFocus's
 * proprietary GF Value chart; not affiliated with, endorsed by, or sourced
 * from GuruFocus LLC. Not investment advice.
 */
export function FairValueHistoryChart({ data }: FairValueHistoryChartProps) {
  const tone = historyTone(data.premiumDiscountPct);
  const chartData = useMemo(() => data.points.map(buildBands), [data.points]);

  // "Now" marker — the last real (non-projected) point with a price, so the
  // dot sits exactly on the price line's own last plotted value rather than
  // the live quote price (which can differ slightly from the last daily
  // close — see FairValueHistoryResult.currentPrice's own doc comment).
  const lastActual = useMemo(() => {
    for (let i = data.points.length - 1; i >= 0; i--) {
      const p = data.points[i];
      if (!p.projected && p.price != null) return p;
    }
    return null;
  }, [data.points]);

  const currencySym = currencySymbol(data.quoteCurrency);

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Fair Value History
          <InfoTooltip
            text="Historical price vs. a growth-adjusted, historical-multiple fair value line (same methodology as the Fair Value Estimate above), shaded in +-10%/+-30% bands. The dashed segment beyond the last price point is a 1-year projection using the same trailing EPS growth rate. FinLens's own approximation — not GuruFocus's proprietary GF Value chart, and not affiliated with, endorsed by, or sourced from GuruFocus LLC. Not investment advice."
          />
        </h3>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
            TONE_BADGE[tone]
          )}
        >
          {data.label}
        </span>
      </div>

      {/* Prominent numeric readout — added so the chart's headline numbers
          are stated in plain, legible text rather than only implied by
          reading line positions off a dense multi-series chart. */}
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg border border-border bg-card/40 p-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current Price</p>
          <p className="font-mono text-base font-bold text-foreground sm:text-lg">
            {data.currentPrice != null ? `${currencySym}${data.currentPrice.toFixed(2)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fair Value</p>
          <p className="font-mono text-base font-bold text-foreground sm:text-lg">
            {data.currentFairValue != null ? `${currencySym}${data.currentFairValue.toFixed(2)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">vs. Fair Value</p>
          <p className={cn("font-mono text-base font-bold sm:text-lg", TONE_TEXT[tone])}>
            {data.premiumDiscountPct != null
              ? `${data.premiumDiscountPct >= 0 ? "+" : ""}${data.premiumDiscountPct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>

      <div className="h-[300px] w-full sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              width={64}
              tickFormatter={(v: number) => `${currencySym}${compactAxis(v)}`}
            />
            <Tooltip
              content={<HistoryTooltip currency={data.quoteCurrency} data={chartData} />}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Area dataKey="floor" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area
              dataKey="bandDeepGreen"
              stackId="band"
              stroke="none"
              fill="rgba(16,185,129,0.35)"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandLightGreen"
              stackId="band"
              stroke="none"
              fill="rgba(16,185,129,0.15)"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandNeutral"
              stackId="band"
              stroke="none"
              fill="rgba(148,163,184,0.08)"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandLightRed"
              stackId="band"
              stroke="none"
              fill="rgba(239,68,68,0.15)"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandDeepRed"
              stackId="band"
              stroke="none"
              fill="rgba(239,68,68,0.35)"
              isAnimationActive={false}
            />
            <Line
              dataKey="fairValueActual"
              stroke="#f8fafc"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="fairValueProjected"
              stroke="#f8fafc"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="price"
              stroke="#38BDF8"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            />
            {lastActual && lastActual.price != null && (
              <ReferenceDot
                x={lastActual.date}
                y={lastActual.price}
                r={4}
                fill="#38BDF8"
                stroke="#0f1420"
                strokeWidth={2}
                label={{ value: "Now", position: "top", fill: "#e2e8f0", fontSize: 10 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> Price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-100" /> Fair Value (dashed = 1yr projection)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-2 w-6 overflow-hidden rounded-full">
            <span className="w-1/2 bg-emerald-500/70" />
            <span className="w-1/2 bg-rose-500/70" />
          </span>
          Shaded bands = undervalued / overvalued zones
        </span>
      </div>

      {data.currencyDiffers && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Note: fair value is computed in {data.reportingCurrency}, but price trades in {data.quoteCurrency} — not
          FX-adjusted.
        </p>
      )}
    </div>
  );
}
