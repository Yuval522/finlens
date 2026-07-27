"use client";

import { useMemo, useState } from "react";
import {
  filterByRange,
  splitTrailingRow,
  type ChartRange,
  type ChartType,
  type ChartView,
} from "./chart-transform";

export interface ChartControlsState<T extends { fiscalYear: string }> {
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  /** Whether real quarterly data exists for this series — feeds ChartControls' quarterlyAvailable prop. */
  quarterlyAvailable: boolean;
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  view: ChartView;
  setView: (view: ChartView) => void;
  /** The active (annual or quarterly, per `chartType`) dataset with any TTM/MRQ trailing row removed, unfiltered by range — feeds totalYears and SourceAttributionBadge. */
  historical: T[];
  /** `historical` sliced by the current Select Range, with the trailing TTM/MRQ row (if present) always re-appended — this is what the chart should render. */
  ranged: T[];
  /** Total real fiscal periods (in years) available for the active chart type — feeds ChartControls' getAvailableRanges. */
  totalYears: number;
  /**
   * Applies THIS card's own chartType/range selection to a different
   * same-shaped dataset. Exists for cards that combine two statements into
   * one view (e.g. Rule of 40 needs both Income and Cash Flow filtered
   * identically) without pulling in a second independent control set —
   * the two series move together because one card's state drives both,
   * not because state is shared across cards.
   */
  rangeOther<U extends { fiscalYear: string }>(otherAnnual: U[], otherQuarterly?: U[]): U[];
}

/**
 * Self-contained Select Range / View / Chart Type state for a single chart
 * card. Each call to this hook creates its own independent useState —
 * mounting it once per ChartCard (rather than once per panel, shared
 * across every card) is what makes changing one chart's controls leave
 * every other chart's controls untouched. See splitTrailingRow/
 * filterByRange in chart-transform.ts for what this builds on.
 */
export function useChartControls<T extends { fiscalYear: string }>(
  annualData: T[],
  quarterlyData: T[] = []
): ChartControlsState<T> {
  const [chartType, setChartType] = useState<ChartType>("annually");
  const quarterlyAvailable = quarterlyData.length > 0;
  const activeData = chartType === "quarterly" ? quarterlyData : annualData;
  const periodsPerYear = chartType === "quarterly" ? 4 : 1;

  const [range, setRange] = useState<ChartRange>("All");
  const [view, setView] = useState<ChartView>("absolute");

  const { historical, trailing } = useMemo(() => splitTrailingRow(activeData), [activeData]);
  const ranged = useMemo(() => {
    const base = filterByRange(historical, range, periodsPerYear);
    return trailing ? [...base, trailing] : base;
  }, [historical, trailing, range, periodsPerYear]);

  function rangeOther<U extends { fiscalYear: string }>(otherAnnual: U[], otherQuarterly: U[] = []): U[] {
    const otherActive = chartType === "quarterly" ? otherQuarterly : otherAnnual;
    const { historical: otherHistorical, trailing: otherTrailing } = splitTrailingRow(otherActive);
    const base = filterByRange(otherHistorical, range, periodsPerYear);
    return otherTrailing ? [...base, otherTrailing] : base;
  }

  const totalYears = chartType === "quarterly" ? Math.floor(historical.length / 4) : historical.length;

  return {
    chartType,
    setChartType,
    quarterlyAvailable,
    range,
    setRange,
    view,
    setView,
    historical,
    ranged,
    totalYears,
    rangeOther,
  };
}
