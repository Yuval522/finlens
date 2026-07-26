"use client";

import { getAvailableRanges, type ChartRange, type ChartView } from "@/lib/finance/chart-transform";

interface ChartControlsProps {
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  view?: ChartView;
  onViewChange?: (view: ChartView) => void;
  /** Hidden for metrics already denominated in %, where a further "YoY %
   *  change of a %" reading would be confusing rather than useful. */
  showView?: boolean;
  /**
   * QA fix ("Select Range does nothing" report): total fiscal periods the
   * underlying dataset actually has, so this can hide any range option
   * that would be indistinguishable from a broader one (see
   * getAvailableRanges' doc comment in chart-transform.ts for the full
   * root-cause explanation — with only ~5 years of data, offering "10
   * Years" as a separate choice from "All Available" was misleading, not
   * broken).
   */
  totalYears: number;
}

const SELECT_CLASS =
  "rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none";

/**
 * Select Range / View / Chart Type controls shown inside a fullscreen
 * ChartCard — see ChartCard's `controls` prop doc comment. Range and View
 * are real, data-backed transforms (lib/finance/chart-transform.ts).
 * Chart Type only offers "Annually" — FinLens's fundamentals data model is
 * annual-only right now (see lib/finance/types.ts), so a "Quarterly"
 * option would have nothing real to show; rather than fake it with
 * repeated annual figures, it's left as a single, honestly-disabled choice
 * until real quarterly data is wired up.
 */
export function ChartControls({ range, onRangeChange, view, onViewChange, showView = true, totalYears }: ChartControlsProps) {
  const availableRanges = getAvailableRanges(totalYears);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-muted-foreground">Select Range</label>
        <select
          value={String(range)}
          onChange={(e) => onRangeChange(e.target.value === "All" ? "All" : (Number(e.target.value) as ChartRange))}
          className={SELECT_CLASS}
        >
          {availableRanges.map((r) => (
            <option key={r} value={r}>
              {r === "All" ? "All Available" : `${r} Years`}
            </option>
          ))}
        </select>
      </div>

      {showView && view && onViewChange && (
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-muted-foreground">View</label>
          <select value={view} onChange={(e) => onViewChange(e.target.value as ChartView)} className={SELECT_CLASS}>
            <option value="absolute">Absolute</option>
            <option value="yoy">YoY % Change</option>
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-muted-foreground">Chart Type</label>
        <select value="annually" disabled className={`${SELECT_CLASS} cursor-not-allowed opacity-60`} title="Quarterly data isn't available yet">
          <option value="annually">Annually</option>
        </select>
      </div>
    </div>
  );
}
