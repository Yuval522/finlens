"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Gauge, Layers, Maximize2, Minimize2, PieChart as PieChartIcon } from "lucide-react";
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
 * Herfindahl-Hirschman Index concentration score (0-100 scale).
 *
 * HHI is the standard economics/antitrust measure of concentration: the sum
 * of each holding's squared percentage share. A single 100%-weight holding
 * scores the maximum (100^2 = 10,000); N equally-weighted holdings score
 * 10,000/N. Dividing the raw HHI by 100 rescales it onto a friendlier 0-100
 * band, and the breakpoints below mirror the DOJ/FTC merger-guideline
 * thresholds (unconcentrated < 1500, moderate 1500-2500, concentrated >
 * 2500 on the raw 0-10,000 scale) translated onto that same /100 band — a
 * well-established, non-arbitrary convention for "how concentrated is
 * this mix" rather than a made-up scoring curve.
 *
 * Computed over the By-Stock slices (individual position weights, cash
 * included as its own position) rather than By-Sector, since position-level
 * concentration — "how much of the portfolio rides on one single stock" —
 * is the more actionable risk signal; a portfolio can be perfectly spread
 * across sectors while still being 60% one stock.
 */
function computeConcentrationScore(slices: Slice[]): number {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return 0;
  const hhi = slices.reduce((sum, s) => {
    const pct = (s.value / total) * 100;
    return sum + pct * pct;
  }, 0);
  return Math.round(Math.min(100, hhi / 100));
}

function concentrationTone(score: number): { label: string; text: string; ring: string; bg: string } {
  if (score < 15) return { label: "Diversified", text: "text-success", ring: "ring-success/30", bg: "bg-success/10" };
  if (score < 25) return { label: "Moderate", text: "text-amber-400", ring: "ring-amber-500/30", bg: "bg-amber-500/10" };
  return { label: "Concentrated", text: "text-destructive", ring: "ring-destructive/30", bg: "bg-destructive/10" };
}

/**
 * One donut + fully-legible legend, reused for both the single-view
 * (non-fullscreen) card and each half of the fullscreen dual-view layout.
 *
 * Bug fix (live report: legend names truncated to "Ot...", "Tec..." in the
 * expanded modal): the previous legend row was `<span className="truncate">`
 * inside a `max-w-[240px]` list — a deliberate width cap that made sense for
 * a compact preview card but silently ellipsized real sector names
 * ("Communication Services", "Consumer Discretionary") once reused at
 * fullscreen size. Legend rows are now a 4-column CSS grid (dot / label /
 * value / percent) with the label column allowed to `break-words` and wrap
 * across lines instead of a flex row with `truncate` — every name renders
 * in full, wrapping onto a second line rather than clipping, while the
 * value/percent columns stay pinned and aligned.
 */
function AllocationPanel({
  title,
  icon,
  slices,
  donutSize,
  align = "start",
}: {
  title: string;
  icon: React.ReactNode;
  slices: Slice[];
  donutSize: string;
  /** Cross-axis alignment of the donut+legend row. "start" (default) suits
   *  the fullscreen dual-panel layout, aligning the donut top with the
   *  legend's first row under each "Allocation By ..." header. "center"
   *  preserves the compact single-view card's original centered look,
   *  where there's no header competing for the top edge. */
  align?: "start" | "center";
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const sorted = slices.slice().sort((a, b) => b.value - a.value);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {title ? (
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
            {icon}
          </span>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
      ) : null}

      {total === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No holdings to allocate yet.
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center gap-5 sm:flex-row sm:gap-6",
            align === "center" ? "sm:items-center" : "sm:items-start"
          )}
        >
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
          <ul className="w-full min-w-0 flex-1 space-y-2.5">
            {sorted.map((s) => (
              <li
                key={s.key}
                className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-2.5 gap-y-0.5 text-xs"
              >
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words font-medium text-foreground">{s.label}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">{money(s.value)}</span>
                <span className="w-12 shrink-0 text-right font-mono font-semibold text-foreground">
                  {((s.value / total) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Portfolio Allocation card. Small/non-fullscreen view is a single donut
 * with a By Stock / By Sector toggle (limited space). Expanding to
 * fullscreen swaps this for a side-by-side "portfolio intelligence
 * dashboard": both views rendered at once (no toggle needed — see
 * AllocationPanel), plus a header-level Portfolio Concentration Score
 * (HHI-based, see computeConcentrationScore) so risk concentration is
 * visible at a glance alongside the breakdowns that explain it.
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

  const concentrationScore = useMemo(() => computeConcentrationScore(stockSlices), [stockSlices]);
  const tone = concentrationTone(concentrationScore);

  const singleViewSlices = view === "stock" ? stockSlices : sectorSlices;

  const expandCollapseButton = (
    <button
      type="button"
      onClick={() => setFullscreen((v) => !v)}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={fullscreen ? "Collapse" : "Expand"}
    >
      {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );

  if (!fullscreen) {
    return (
      <div className="glass-card flex min-w-0 flex-col rounded-xl p-3 sm:p-4">
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-foreground">Asset Allocation</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* By Stock / By Sector toggle — a segmented pill control matching
                the app's existing CurrencyToggle pattern. Only shown in the
                compact single-view card; fullscreen shows both views at once
                (see the dual-panel layout below) so the toggle is redundant
                there. */}
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
            {expandCollapseButton}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {singleViewSlices.reduce((s, x) => s + x.value, 0) === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No holdings to allocate yet.
            </div>
          ) : (
            <div className="flex w-full max-w-md items-center gap-5">
              <AllocationPanel
                title=""
                icon={null}
                slices={singleViewSlices}
                donutSize="h-40 w-40"
                align="center"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
        onClick={() => setFullscreen(false)}
        aria-hidden="true"
      />
      <div className="glass-card fixed inset-4 z-[60] flex flex-col overflow-hidden rounded-xl p-4 shadow-2xl sm:inset-x-[6%] sm:inset-y-[6%] sm:p-6">
        {/* Header: title, Portfolio Concentration Score, collapse button. */}
        <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Asset Allocation</h3>
              <p className="text-xs text-muted-foreground">Portfolio intelligence dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Portfolio Concentration Score — HHI-based, see
                computeConcentrationScore's doc comment for the methodology
                and why it's derived from By-Stock (not By-Sector) weights. */}
            <div className={cn("flex items-center gap-2.5 rounded-lg px-3 py-1.5 ring-1", tone.bg, tone.ring)}>
              <Gauge className={cn("h-4 w-4 shrink-0", tone.text)} />
              <div className="leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Concentration Score
                </p>
                <p className={cn("font-mono text-sm font-bold", tone.text)}>
                  {concentrationScore}
                  <span className="text-muted-foreground">/100</span>
                  <span className="ml-1.5 text-xs font-semibold">{tone.label}</span>
                </p>
              </div>
            </div>
            {expandCollapseButton}
          </div>
        </div>

        {/* Side-by-side dual view: By Sector (left) + By Stock (right) —
            both rendered simultaneously so the ample fullscreen width is
            used for a genuine two-angle breakdown instead of one enlarged
            donut. Stacks to a single column below `lg` so it never
            compresses illegibly on a narrower viewport. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-auto lg:grid-cols-2 lg:divide-x lg:divide-border lg:overflow-hidden">
          <div className="min-h-0 lg:overflow-auto lg:pr-6">
            <AllocationPanel
              title="Allocation By Sector"
              icon={<Layers className="h-3.5 w-3.5" />}
              slices={sectorSlices}
              donutSize="h-52 w-52 sm:h-60 sm:w-60"
            />
          </div>
          <div className="min-h-0 lg:overflow-auto lg:pl-6">
            <AllocationPanel
              title="Allocation By Stock"
              icon={<PieChartIcon className="h-3.5 w-3.5" />}
              slices={stockSlices}
              donutSize="h-52 w-52 sm:h-60 sm:w-60"
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
