"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ValuationMethodResult, ValuationMethodsResult } from "@/lib/finance/valuation-methods";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/format/chart";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

interface ValuationMethodsChartProps {
  data: ValuationMethodsResult;
}

const TONE_FILL: Record<"good" | "ok" | "bad" | "none", string> = {
  good: "#10B981",
  ok: "#F59E0B",
  bad: "#EF4444",
  none: "#64748B",
};

type MethodRow = ValuationMethodResult & { currentPrice: number | null };

interface MethodsTooltipProps {
  active?: boolean;
  payload?: { payload?: MethodRow }[];
  currency: string;
}

/** Passed as a JSX element (not a function) to `content` — same convention
 *  used by every other custom Recharts tooltip in this codebase. */
function MethodsTooltip({ active, payload, currency }: MethodsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row || row.value == null) return null;
  const diffPct = row.currentPrice != null ? ((row.currentPrice - row.value) / row.value) * 100 : null;
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="mb-1.5 font-semibold text-foreground">{row.label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Value</span>
          <span className="font-medium text-foreground">
            {row.value.toFixed(2)} {currency}
          </span>
        </div>
        {diffPct != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Price vs. Value</span>
            <span className="font-medium text-foreground">
              {diffPct >= 0 ? "+" : ""}
              {diffPct.toFixed(1)}%
            </span>
          </div>
        )}
        {row.note && (
          <p className="max-w-[220px] whitespace-normal pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {row.note}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontal comparison of several independent, publicly-documented
 * per-share valuation formulas against the current price — see
 * lib/finance/valuation-methods.ts for the full list and each formula's
 * source/assumptions. Not GuruFocus's proprietary formulas; not affiliated
 * with, endorsed by, or sourced from GuruFocus LLC. Not investment advice.
 */
export function ValuationMethodsChart({ data }: ValuationMethodsChartProps) {
  const rows: MethodRow[] = data.methods
    .filter((m) => m.value != null)
    .map((m) => ({ ...m, currentPrice: data.currentPrice }));

  if (rows.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">Valuation Methods Comparison</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Not enough historical fundamentals to compute these valuation benchmarks yet.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-foreground">Valuation Methods Comparison</h3>
        <InfoTooltip text="Several independent, publicly-documented per-share valuation formulas (Graham Number, Peter Lynch's growth heuristic, book value, growth-adjusted historical P/FCF and P/S multiples, and a simplified two-stage earnings DCF) compared against the current price. Green = price below that method's value (potentially undervalued), red = above (potentially overvalued). Not GuruFocus's proprietary formulas; not affiliated with, endorsed by, or sourced from GuruFocus LLC. Not investment advice." />
      </div>

      <div style={{ height: Math.max(220, rows.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke="rgba(148,163,184,0.08)" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={168}
            />
            <Tooltip
              content={<MethodsTooltip currency={data.reportingCurrency} />}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              cursor={{ fill: "rgba(148,163,184,0.06)" }}
            />
            {data.currentPrice != null && (
              <ReferenceLine
                x={data.currentPrice}
                stroke="#f8fafc"
                strokeDasharray="4 4"
                label={{ value: "Current Price", position: "top", fill: "#f8fafc", fontSize: 10 }}
              />
            )}
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.key} fill={TONE_FILL[row.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.currencyDiffers && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Note: valuation methods are computed in {data.reportingCurrency}, but price trades in {data.quoteCurrency}{" "}
          — not FX-adjusted.
        </p>
      )}
    </div>
  );
}
