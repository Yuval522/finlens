"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/finance/types";

export type ChartMode = "area" | "candlestick";

interface PriceChartProps {
  /** Already converted to display units (e.g. agorot -> shekels) and sliced to the selected range. */
  data: PricePoint[];
  mode: ChartMode;
  showSma?: boolean;
  smaPeriod?: number;
  /** Drives area-chart gradient/line color — true = period gained, false = lost. Ignored when overrideColor is set. */
  positive: boolean;
  /**
   * Intl locale for axis date labels. QA hotfix (Phase 4): this used to be
   * left unset, so lightweight-charts fell back to the browser's own
   * locale (e.g. a Hebrew OS/browser setting rendered Hebrew month labels
   * for every ticker, not just TASE ones). Callers should pass "he-IL"
   * only for .TA/TLV symbols and "en-US" for everything else.
   */
  locale?: string;
  /** Show/hide background grid lines. Defaults to visible. */
  showGrid?: boolean;
  /**
   * When set, overrides the default green-gain/red-loss color with a single
   * flat accent color (area line/fill, or candle up+down+wick colors) —
   * powers the chart's color-preset picker. `null`/`undefined` keeps the
   * default trend-based coloring.
   */
  overrideColor?: string | null;
}

const SUCCESS = "#10B981";
const DESTRUCTIVE = "#EF4444";
const SMA_COLOR = "#F59E0B";

/** Converts a "#RRGGBB" hex color to an "rgba(r, g, b, alpha)" string for area-chart fills. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function timeToDate(time: Time): Date {
  if (typeof time === "string") return new Date(time);
  if (typeof time === "number") return new Date(time * 1000);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

/**
 * QA hotfix (Final Polish pass): AAPL's date axis was still rendering
 * Hebrew month labels live, despite `localization.locale` already being
 * set correctly to "en-US" for non-TASE symbols (that logic — isTaseListing
 * gating "he-IL" — is correct; see ChartPanel.tsx). lightweight-charts'
 * *default* tick-mark formatter is documented to take the chart's
 * `localization.locale`, but that resolution is unverified live in this
 * sandbox and evidently isn't reliable in practice. Supplying an explicit
 * `tickMarkFormatter` removes the ambiguity entirely: we format the label
 * ourselves with `Intl.DateTimeFormat(locale, ...)` using the exact same
 * `locale` value already computed by isTaseListing(), so correctness no
 * longer depends on any library-internal default.
 */
function makeTickMarkFormatter(locale: string) {
  return (time: Time, tickMarkType: TickMarkType): string => {
    const date = timeToDate(time);
    switch (tickMarkType) {
      case TickMarkType.Year:
        return date.toLocaleDateString(locale, { year: "numeric" });
      case TickMarkType.Month:
        return date.toLocaleDateString(locale, { month: "short" });
      case TickMarkType.DayOfMonth:
        return date.toLocaleDateString(locale, { day: "numeric" });
      default:
        return date.toLocaleDateString(locale, { hour: "2-digit", minute: "2-digit" });
    }
  };
}

function computeSma(data: PricePoint[], period: number) {
  const result: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) sum -= data[i - period].close;
    if (i >= period - 1) {
      result.push({ time: data[i].date, value: Number((sum / period).toFixed(4)) });
    }
  }
  return result;
}

export function PriceChart({
  data,
  mode,
  showSma = false,
  smaPeriod = 20,
  positive,
  locale = "en-US",
  showGrid = true,
  overrideColor = null,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<
    ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null
  >(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Create the chart instance once, tear it down on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)", visible: showGrid },
        horzLines: { color: "rgba(148, 163, 184, 0.08)", visible: showGrid },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        tickMarkFormatter: makeTickMarkFormatter(locale),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale },
      width: container.clientWidth,
      height: container.clientHeight || 360,
    });
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      chart.resize(Math.max(Math.floor(width), 0), Math.max(Math.floor(height), 200));
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      smaSeriesRef.current = null;
    };
    // showGrid is intentionally read only as this effect's *initial* value —
    // it must stay out of the deps array, since re-running it would tear
    // down and recreate the whole chart (losing zoom/scroll position) just
    // to flip a grid switch. Live toggling is handled by the dedicated
    // applyOptions() effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // Live grid visibility toggle — applyOptions() rather than baking it into
  // the creation effect above, so flipping the switch doesn't tear down and
  // recreate the whole chart (losing zoom/scroll position).
  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { visible: showGrid },
        horzLines: { visible: showGrid },
      },
    });
  }, [showGrid]);

  // Swap the main series whenever mode/data/direction/color changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }

    if (data.length === 0) return;

    const upDownColor = overrideColor ?? (positive ? SUCCESS : DESTRUCTIVE);

    if (mode === "area") {
      const series = chart.addSeries(AreaSeries, {
        lineColor: upDownColor,
        topColor: hexToRgba(upDownColor, 0.35),
        bottomColor: hexToRgba(upDownColor, 0.02),
        lineWidth: 2,
      });
      series.setData(data.map((d) => ({ time: d.date, value: d.close })));
      mainSeriesRef.current = series;
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: overrideColor ?? SUCCESS,
        downColor: overrideColor ?? DESTRUCTIVE,
        borderVisible: false,
        wickUpColor: overrideColor ?? SUCCESS,
        wickDownColor: overrideColor ?? DESTRUCTIVE,
      });
      series.setData(
        data.map((d) => ({
          time: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
      mainSeriesRef.current = series;
    }

    chart.timeScale().fitContent();
  }, [mode, data, positive, overrideColor]);

  // SMA overlay toggle.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (smaSeriesRef.current) {
      chart.removeSeries(smaSeriesRef.current);
      smaSeriesRef.current = null;
    }

    if (showSma && data.length > smaPeriod) {
      const series = chart.addSeries(LineSeries, {
        color: SMA_COLOR,
        lineWidth: 2,
        crosshairMarkerVisible: false,
      });
      series.setData(computeSma(data, smaPeriod));
      smaSeriesRef.current = series;
    }
  }, [showSma, smaPeriod, data]);

  return (
    <div ref={containerRef} className="h-[320px] w-full min-w-0 overflow-hidden sm:h-[400px]" />
  );
}
