"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MACRO_RANGES, sliceMacroRange, type MacroRange, type MacroSeries } from "@/lib/macro/data";
import { CHART_TOOLTIP_STYLE } from "@/lib/format/chart";

/**
 * Single macro-indicator summary card: current value + a compact trend
 * chart with its own independent 1Y/5Y/MAX range toggle (each card tracks
 * its own range state, matching the "timeframe toggles for each macro
 * metric" spec — not one shared control for the whole grid).
 */
export function MacroIndicatorCard({ series }: { series: MacroSeries }) {
  const [range, setRange] = useState<MacroRange>("5Y");
  const data = useMemo(() => sliceMacroRange(series.history, range), [series.history, range]);
  const current = data[data.length - 1]?.value ?? null;
  const first = data[0]?.value ?? null;
  const delta = current != null && first != null ? current - first : null;

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{series.label}</h3>
          <p className="text-[11px] text-muted-foreground">{series.description}</p>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md bg-accent/60 p-0.5">
          {MACRO_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                range === r ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-foreground">
          {current != null ? current.toFixed(2) : "—"}
          {series.unit}
        </span>
        {delta != null && (
          <span className={`font-mono text-xs font-medium ${delta >= 0 ? "text-success" : "text-destructive"}`}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(2)}
            {series.unit} over period
          </span>
        )}
      </div>

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`macroFill-${series.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              formatter={(value) => [`${Number(value).toFixed(2)}${series.unit}`, series.label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={series.color}
              strokeWidth={2}
              fill={`url(#macroFill-${series.id})`}
              animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
