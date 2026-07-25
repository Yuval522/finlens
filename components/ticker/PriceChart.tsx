"use client";

import { useEffect, useRef, useState } from "react";
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
  type MouseEventParams,
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

/** Formats the hovered point's date for the floating crosshair tooltip. */
function formatTooltipTime(time: Time, locale: string): string {
  return timeToDate(time).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Pulls a display price out of whatever shape lightweight-charts'
 * `seriesData.get(series)` hands back — `{ value }` for the area/line
 * series, `{ close }` for candlesticks. Written with `unknown` + `in`
 * narrowing (no `any`) since the exact union type depends on which main
 * series is currently mounted.
 */
function extractTooltipPrice(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  if ("value" in data && typeof (data as { value: unknown }).value === "number") {
    return (data as { value: number }).value;
  }
  if ("close" in data && typeof (data as { close: unknown }).close === "number") {
    return (data as { close: number }).close;
  }
  return null;
}

const TOOLTIP_WIDTH = 132;
const TOOLTIP_HEIGHT = 52;
const TOOLTIP_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface ChartTooltipState {
  x: number;
  y: number;
  time: string;
  price: number;
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
  // Tracks the main series' current display color so the floating tooltip's
  // legend swatch always matches the line/candles on screen, including when
  // the color-preset picker (ChartPanel.tsx) overrides it.
  const seriesColorRef = useRef<string>(SUCCESS);
  const [tooltip, setTooltip] = useState<ChartTooltipState | null>(null);

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

    /**
     * Design-audit item #5 ("Priority Order for Dev Hand-off"): a floating
     * cursor-tracking tooltip to match iCharts' near-cursor time+price
     * readout, without removing the existing crosshair. Purely additive —
     * doesn't touch the grid-toggle/color-picker options or index-aware
     * logic elsewhere in the app.
     */
    function handleCrosshairMove(param: MouseEventParams<Time>) {
      // TS doesn't carry the outer `if (!container) return;` narrowing into
      // a nested function declaration's body, so re-check here explicitly.
      if (!container) return;
      const series = mainSeriesRef.current;
      if (!series || !param.point || !param.time) {
        setTooltip(null);
        return;
      }
      const price = extractTooltipPrice(param.seriesData.get(series));
      if (price == null) {
        setTooltip(null);
        return;
      }
      const maxX = Math.max(container.clientWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN, TOOLTIP_MARGIN);
      const maxY = Math.max(container.clientHeight - TOOLTIP_HEIGHT - TOOLTIP_MARGIN, TOOLTIP_MARGIN);
      setTooltip({
        x: clamp(param.point.x + 14, TOOLTIP_MARGIN, maxX),
        y: clamp(param.point.y - 12, TOOLTIP_MARGIN, maxY),
        time: formatTooltipTime(param.time, locale),
        price,
      });
    }
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      chart.resize(Math.max(Math.floor(width), 0), Math.max(Math.floor(height), 200));
    });
    ro.observe(container);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      smaSeriesRef.current = null;
      setTooltip(null);
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
    // The old series (and any hovered point on it) is gone — clear any
    // stale floating tooltip rather than leaving it pinned to a price
    // that no longer belongs to the chart underneath it.
    setTooltip(null);

    if (data.length === 0) return;

    const upDownColor = overrideColor ?? (positive ? SUCCESS : DESTRUCTIVE);
    seriesColorRef.current = upDownColor;

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
    <div
      ref={containerRef}
      className="relative h-[320px] w-full min-w-0 overflow-hidden sm:h-[400px]"
    >
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 flex flex-col gap-1 rounded-md border border-white/10 bg-slate-900/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={{ left: tooltip.x, top: tooltip.y, width: TOOLTIP_WIDTH }}
        >
          <span className="text-[10px] text-muted-foreground">{tooltip.time}</span>
          <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: seriesColorRef.current }}
            />
            {tooltip.price.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
