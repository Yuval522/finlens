"use client";

import { useState } from "react";
import { BarChart3, Maximize2, Minimize2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_TOOLTIP_STYLE } from "@/lib/format/chart";
import type { PortfolioHolding } from "@/lib/portfolio/store";

interface AssetAllocationChartProps {
  holdings: PortfolioHolding[];
  totalCashUsd: number;
}

/** Distinct, readable slice colors — cycles if there are more holdings than colors. */
const SLICE_COLORS = [
  "#6366F1", // primary indigo
  "#10B981", // success emerald
  "#F59E0B", // amber
  "#38BDF8", // sky
  "#EC4899", // pink
  "#A855F7", // purple
  "#F43F5E", // rose
  "#14B8A6", // teal
];
const CASH_COLOR = "#64748B"; // slate — visually distinct from every holding color

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Donut chart + color-coded legend showing each holding's weight in the
 * portfolio plus a "Cash position" slice, matching the reference terminal's
 * Asset Allocation panel.
 */
export function AssetAllocationChart({ holdings, totalCashUsd }: AssetAllocationChartProps) {
  // Confirmed via live comparison against the reference terminal: the
  // Asset Allocation card carries the same icon-badge treatment as Home's
  // Market Summary/Most Active sections, plus its own maximize toggle
  // (Portfolio Value doesn't have one there — just the icon badge).
  const [fullscreen, setFullscreen] = useState(false);

  const slices: Slice[] = holdings.map((h, i) => ({
    key: h.symbol,
    label: h.symbol,
    value: h.shares * h.currentPrice,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  if (totalCashUsd > 0) {
    slices.push({ key: "__cash", label: "Cash position", value: totalCashUsd, color: CASH_COLOR });
  }

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <>
      {fullscreen && (
        <div
          className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={
          fullscreen
            ? "glass-card fixed inset-4 z-[60] flex flex-col overflow-hidden rounded-xl p-3 shadow-2xl sm:inset-x-[8%] sm:inset-y-[6%] sm:p-4"
            : "glass-card min-w-0 rounded-xl p-3 sm:p-4"
        }
      >
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-foreground">Asset Allocation</h3>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={fullscreen ? "Collapse" : "Expand"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className={fullscreen ? "min-h-0 flex-1 overflow-auto" : ""}>
      {total === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground sm:h-64">
          No holdings to allocate yet.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className={fullscreen ? "h-64 w-64 shrink-0 sm:h-72 sm:w-72" : "h-48 w-48 shrink-0"}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  animationDuration={500}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value, _name, entry) => [
                    `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} (${(
                      (Number(value) / total) *
                      100
                    ).toFixed(1)}%)`,
                    entry?.payload?.label ?? "",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-1.5">
            {slices
              .slice()
              .sort((a, b) => b.value - a.value)
              .map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {((s.value / total) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
        </div>
      </div>
    </>
  );
}
