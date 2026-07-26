"use client";

import { getAvailableRanges, type ChartRange, type ChartType, type ChartView } from "@/lib/finance/chart-transform";

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
   * *currently displayed* dataset (annual or quarterly, per `chartType`)
   * actually has, so this can hide any range option that would be
   * indistinguishable from a broader one (see getAvailableRanges' doc
   * comment in chart-transform.ts for the full root-cause explanation).
   * Always expressed in *years* — pass quarterly period count / 4 when
   * chartType is "quarterly", not the raw quarter count.
   */
  totalYears: number;
  /**
   * Chart Type: Annually/Quarterly. Optional — omit (or pass
   * quarterlyAvailable={false}) to render the old single, disabled
   * "Annually" choice, e.g. for a chart genuinely computed only from
   * annual figures (Rule of 40).
   */
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  /**
   * Whether real quarterly data exists for this metric on this symbol
   * (i.e. FundamentalsBundle.*Quarterly came back non-empty — see
   * lib/finance/types.ts). When false, Quarterly is disabled with an
   * honest tooltip rather than offered with nothing behind it — same
   * principle as getAvailableRanges hiding a range option that would be a
   * silent no-op.
   */
  quarterlyAvailable?: boolean;
}

const SELECT_CLASS =
  "rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none";

/**
 * Select Range / View / Chart Type controls shown inside a fullscreen
 * ChartCard — see ChartCard's `controls` prop doc comment. All three are
 * real, data-backed transforms (lib/finance/chart-transform.ts): Range
 * genuinely slices the array, View genuinely recomputes YoY, and Chart
 * Type genuinely switches between the annual and quarterly datasets
 * fetched in getFundamentals() (see lib/finance/aggregate.ts) — no longer
 * a single hardcoded "Annually" choice now that real quarterly data
 * (SEC EDGAR 10-Qs / Yahoo / FMP) is wired up.
 */
export function ChartControls({
  range,
  onRangeChange,
  view,
  onViewChange,
  showView = true,
  totalYears,
  chartType,
  onChartTypeChange,
  quarterlyAvailable = false,
}: ChartControlsProps) {
  const availableRanges = getAvailableRanges(totalYears);
  const chartTypeEnabled = Boolean(chartType && onChartTypeChange && quarterlyAvailable);
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
        {chartTypeEnabled ? (
          <select
            value={chartType}
            onChange={(e) => onChartTypeChange!(e.target.value as ChartType)}
            className={SELECT_CLASS}
          >
            <option value="annually">Annually</option>
            <option value="quarterly">Quarterly</option>
          </select>
        ) : (
          <select
            value="annually"
            disabled
            className={`${SELECT_CLASS} cursor-not-allowed opacity-60`}
            title={
              chartType && onChartTypeChange
                ? "No quarterly data available for this symbol"
                : "This chart is computed from annual figures only"
            }
          >
            <option value="annually">Annually</option>
          </select>
        )}
      </div>
    </div>
  );
}
