"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactAxis } from "@/lib/format/chart";
import { buildPortfolioHistory, PORTFOLIO_RANGES, type PortfolioRange } from "@/lib/portfolio/mock-history";

interface PortfolioValueChartProps {
  startValue: number;
  endValue: number;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Line/area chart of portfolio value over time with a 1W/1M/1Y/ALL range
 * dropdown and a hover tooltip ("Today / Portfolio Value: $X"), matching the
 * reference terminal's Portfolio Value panel. The series itself is a
 * generated illustrative history (see lib/portfolio/mock-history.ts's doc
 * comment) since there's no backend recording daily snapshots — it always
 * starts near cost basis and ends exactly on the real current total.
 */
export function PortfolioValueChart({ startValue, endValue }: PortfolioValueChartProps) {
  const [range, setRange] = useState<PortfolioRange>("1M");
  const positive = endValue >= startValue;
  const lineColor = positive ? CHART_COLORS.success : CHART_COLORS.destructive;

  const data = useMemo(() => buildPortfolioHistory(range, startValue, endValue), [range, startValue, endValue]);

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Portfolio Value</h3>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as PortfolioRange)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
          aria-label="Portfolio value time range"
        >
          {PORTFOLIO_RANGES.map((r) => (
            <option key={r} value={r}>
              {r === "1W" ? "1 Week" : r === "1M" ? "1 Month" : r === "1Y" ? "1 Year" : "All Time"}
            </option>
          ))}
        </select>
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(d: string) => {
                const date = new Date(d);
                return range === "1W" || range === "1M"
                  ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
              }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${compactAxis(v)}`}
              domain={["auto", "auto"]}
              width={56}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(d) => {
                const raw = String(d);
                const date = new Date(raw);
                const isToday = raw === new Date().toISOString().slice(0, 10);
                const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return isToday ? `Today (${label})` : label;
              }}
              formatter={(value) => [formatUsd(Number(value)), "Portfolio Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#portfolioValueFill)"
              activeDot={{ r: 4 }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
