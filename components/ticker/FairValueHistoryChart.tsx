"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FairValueHistoryPoint, FairValueHistoryResult } from "@/lib/finance/valuation-history";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/format/chart";
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

interface HistoryTooltipProps {
  active?: boolean;
  label?: string;
  payload?: { payload?: ChartRow }[];
  currency: string;
}

/** Passed as a JSX element (not a function) to `content` — same convention
 *  used by every other custom Recharts tooltip in this codebase (see
 *  ChartTooltip.tsx's doc comment). */
function HistoryTooltip({ active, label, payload, currency }: HistoryTooltipProps) {
  if (!active || !label || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fv = row.fairValueActual ?? row.fairValueProjected;
  return (
    <div style={CHART_TOOLTIP_STYLE}>
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

      <div className="h-[280px] w-full sm:h-[340px]">
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
              width={56}
            />
            <Tooltip
              content={<HistoryTooltip currency={data.quoteCurrency} />}
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
              stroke="#e2e8f0"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="fairValueProjected"
              stroke="#e2e8f0"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="price"
              stroke="#38BDF8"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> Price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> Fair Value (dashed = projected)
        </span>
        {data.currentPrice != null && data.currentFairValue != null && data.premiumDiscountPct != null && (
          <span className={cn("font-mono font-semibold", TONE_TEXT[tone])}>
            {data.premiumDiscountPct >= 0 ? "+" : ""}
            {data.premiumDiscountPct.toFixed(1)}% vs. fair value
          </span>
        )}
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
