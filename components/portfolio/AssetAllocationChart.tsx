"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Maximize2, Minimize2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE } from "@/lib/format/chart";
import { getSectorForSymbol } from "@/lib/finance/screener-data";
import type { PortfolioHolding } from "@/lib/portfolio/store";
import { cn } from "@/lib/utils";

interface AssetAllocationChartProps {
  holdings: PortfolioHolding[];
  totalCashUsd: number;
}

/** Distinct, readable slice colors — cycles if there are more holdings/sectors than colors. */
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
const CASH_COLOR = "#64748B"; // slate — visually distinct from every holding/sector color

type AllocationView = "stock" | "sector";

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function money(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Donut chart + color-coded legend showing portfolio allocation, either
 * per-holding ("By Stock") or grouped by sector ("By Sector") — see
 * getSectorForSymbol's doc comment for how the sector grouping is derived.
 * Redesigned (QA pass, live report: "still too thin," "modal breaks/looks
 * half-empty") around one central idea: the donut+legend block is a fixed
 * max-width unit that's *centered* in whatever space it has (small preview
 * card or fullscreen modal), rather than a flex row whose legend column
 * stretches to fill 100% of the available width. A stretched `flex-1`
 * legend with `justify-between` rows looks fine with a handful of short
 * labels in a ~500px card, but in an 860px+ fullscreen modal it pins each
 * label to the far left and each percentage to the far right of a very
 * wide row, leaving a huge, awkward dead gap in the middle — which is
 * exactly the "half-empty/clipped" look reported. Centering a
 * fixed-max-width block instead means the *extra* modal space becomes
 * even, symmetric margin on both sides (matching the explicit ask to
 * "render properly centered"), not wasted space inside the content itself.
 */
export function AssetAllocationChart({ holdings, totalCashUsd }: AssetAllocationChartProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<AllocationView>("stock");

  const stockSlices: Slice[] = useMemo(() => {
    const slices = holdings.map((h, i) => ({
      key: h.symbol,
      label: h.symbol,
      value: h.shares * h.currentPrice,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }));
    if (totalCashUsd > 0) slices.push({ key: "__cash", label: "Cash position", value: totalCashUsd, color: CASH_COLOR });
    return slices;
  }, [holdings, totalCashUsd]);

  const sectorSlices: Slice[] = useMemo(() => {
    const bySector = new Map<string, number>();
    for (const h of holdings) {
      const sector = getSectorForSymbol(h.symbol);
      bySector.set(sector, (bySector.get(sector) ?? 0) + h.shares * h.currentPrice);
    }
    const slices = [...bySector.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sector, value], i) => ({ key: sector, label: sector, value, color: SLICE_COLORS[i % SLICE_COLORS.length] }));
    if (totalCashUsd > 0) slices.push({ key: "__cash", label: "Cash position", value: totalCashUsd, color: CASH_COLOR });
    return slices;
  }, [holdings, totalCashUsd]);

  const slices = view === "stock" ? stockSlices : sectorSlices;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const sorted = slices.slice().sort((a, b) => b.value - a.value);

  const donutSize = fullscreen ? "h-56 w-56 sm:h-64 sm:w-64" : "h-40 w-40";

  const cardBody = (
    <>
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
            <BarChart3 className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Asset Allocation</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* By Stock / By Sector toggle — a segmented pill control matching
              the app's existing CurrencyToggle pattern, not a plain <select>,
              since there are only ever two options and this reads faster as
              two adjacent buttons than a dropdown. */}
          <div className="flex rounded-md border border-border bg-card p-0.5 text-xs">
            {(["stock", "sector"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "stock" ? "By Stock" : "By Sector"}
              </button>
            ))}
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
      </div>

      {/* QA fix (fullscreen modal rendering half-empty): this wrapper is
          now the thing that fills the remaining modal height and CENTERS
          its (fixed max-width) child, instead of a flex-1 legend column
          stretching to fill leftover width — see this component's doc
          comment above for the full root cause. */}
      <div className={cn("flex min-h-0 flex-1 items-center justify-center", fullscreen && "overflow-auto")}>
        {total === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No holdings to allocate yet.
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div className={cn("shrink-0", donutSize)}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sorted}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="100%"
                    paddingAngle={2}
                    animationDuration={500}
                  >
                    {sorted.map((s) => (
                      <Cell key={s.key} fill={s.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                    formatter={(value, _name, entry) => [
                      `${money(Number(value))} (${((Number(value) / total) * 100).toFixed(1)}%)`,
                      entry?.payload?.label ?? "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full min-w-0 max-w-[240px] space-y-2.5">
              {sorted.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{s.label}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">{money(s.value)}</span>
                  <span className="w-12 shrink-0 text-right font-mono font-semibold text-foreground">
                    {((s.value / total) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );

  if (!fullscreen) {
    return <div className="glass-card flex min-w-0 flex-col rounded-xl p-3 sm:p-4">{cardBody}</div>;
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
        onClick={() => setFullscreen(false)}
        aria-hidden="true"
      />
      <div className="glass-card fixed inset-4 z-[60] flex flex-col overflow-hidden rounded-xl p-3 shadow-2xl sm:inset-x-[8%] sm:inset-y-[6%] sm:p-4">
        {cardBody}
      </div>
    </>,
    document.body
  );
}
