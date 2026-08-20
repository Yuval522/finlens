"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/finance/types";
import { computeBollingerBands, computeEmaSeries, computeMacd, computeRsiSeries } from "@/lib/finance/chartIndicators";

export type ChartMode = "area" | "candlestick";

/**
 * Chart drawing tools (toolbar "Edit"/Tools drawer, see ChartPanel.tsx).
 * "horizontal" completes on a single click; "trendline"/"fibonacci" wait
 * for a second click before drawing anything, see the click handler below.
 */
export type DrawTool = "trendline" | "fibonacci" | "horizontal";

interface PriceChartProps {
  /** Already converted to display units (e.g. agorot -> shekels) and sliced to the selected range. */
  data: PricePoint[];
  mode: ChartMode;
  showSma?: boolean;
  smaPeriod?: number;
  /** Which EMA periods to overlay (e.g. [50, 200]) — same pane as the main series. Empty/omitted shows none. */
  emaPeriods?: number[];
  /** Bollinger Bands (20, 2σ) overlay, same pane as the main series. */
  showBollinger?: boolean;
  /** RSI-14 in its own sub-pane below the main chart. */
  showRsi?: boolean;
  /** MACD (12, 26, 9) — line + signal + histogram — in its own sub-pane. */
  showMacd?: boolean;
  /** Currently-armed drawing tool, or null when the chart should behave normally (pan/zoom, no click-to-draw). Reset to null by the parent via onDrawComplete after one shape is placed. */
  drawTool?: DrawTool | null;
  /** Fires once a drawing tool has placed its shape (or been cancelled by Escape) — the parent uses this to un-arm the tool button. */
  onDrawComplete?: () => void;
  /** Bump this (e.g. a counter) to wipe every user-drawn trendline/fibonacci/horizontal-line from the chart. */
  clearDrawingsToken?: number;
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
  /** Fullscreen expand mode (ChartPanel.tsx) — swaps the fixed 320/400px height for a flex `h-full` that fills whatever taller container the fullscreen card provides. */
  fullHeight?: boolean;
}

const SUCCESS = "#10B981";
const DESTRUCTIVE = "#EF4444";
const SMA_COLOR = "#F59E0B";
/** One distinct color per selectable EMA period so overlapping EMAs stay visually distinguishable. */
const EMA_COLORS: Record<number, string> = {
  50: "#38BDF8",
  100: "#C084FC",
  150: "#FB923C",
  200: "#F472B6",
};
const BOLLINGER_COLOR = "#A78BFA";
const RSI_COLOR = "#38BDF8";
const MACD_COLOR = "#38BDF8";
const MACD_SIGNAL_COLOR = "#F59E0B";
const DRAW_COLOR = "#F59E0B";
const FIB_COLOR = "#A78BFA";

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

/** Standard Fibonacci retracement ratios, drawn from the higher clicked price down to the lower one. */
const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function PriceChart({
  data,
  mode,
  showSma = false,
  smaPeriod = 20,
  emaPeriods = [],
  showBollinger = false,
  showRsi = false,
  showMacd = false,
  drawTool = null,
  onDrawComplete,
  clearDrawingsToken = 0,
  positive,
  locale = "en-US",
  showGrid = true,
  overrideColor = null,
  fullHeight = false,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<
    ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null
  >(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const bollingerSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
  // User-drawn trendlines (2-point Line series, one per drawing) and
  // fibonacci/horizontal price lines (attached to the main series) — kept
  // in refs so the click handler (registered once, in the creation effect)
  // and the "Clear Drawings" effect can both reach them without either one
  // needing to be in the other's dependency array.
  const drawnSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const drawnPriceLinesRef = useRef<IPriceLine[]>([]);
  const drawStartRef = useRef<{ time: Time; price: number } | null>(null);
  // Mirrors of the latest drawTool/onDrawComplete props — the click handler
  // is registered once (creation effect depends only on `locale`) but must
  // always see the CURRENT armed tool, not the one active when the chart
  // was first created, hence refs updated by a separate effect below.
  const drawToolRef = useRef<DrawTool | null>(drawTool);
  const onDrawCompleteRef = useRef(onDrawComplete);
  // Tracks the main series' current display color so the floating tooltip's
  // legend swatch always matches the line/candles on screen, including when
  // the color-preset picker (ChartPanel.tsx) overrides it.
  const seriesColorRef = useRef<string>(SUCCESS);
  const [tooltip, setTooltip] = useState<ChartTooltipState | null>(null);

  useEffect(() => {
    drawToolRef.current = drawTool;
  }, [drawTool]);

  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete;
  }, [onDrawComplete]);

  /** Removes every user-drawn trendline series + fib/horizontal price lines from the chart and empties the tracking refs. Used by both the "Clear Drawings" toolbar action and internally whenever the underlying data set changes (a drawing anchored to old range's dates/prices stops making sense once the range/mode changes). */
  function clearAllDrawings() {
    const chart = chartRef.current;
    if (chart) {
      for (const series of drawnSeriesRef.current) {
        try {
          chart.removeSeries(series);
        } catch {
          // series may already be gone if the whole chart was torn down first — safe to ignore.
        }
      }
    }
    const main = mainSeriesRef.current;
    if (main) {
      for (const line of drawnPriceLinesRef.current) {
        try {
          main.removePriceLine(line);
        } catch {
          // same as above.
        }
      }
    }
    drawnSeriesRef.current = [];
    drawnPriceLinesRef.current = [];
    drawStartRef.current = null;
  }

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

    /**
     * Chart Tools drawer, drawing tools (ChartPanel.tsx): click-to-draw for
     * trendline/fibonacci (2 clicks: anchor, then target) and horizontal
     * line (1 click). Reads drawToolRef/onDrawCompleteRef rather than the
     * `drawTool`/`onDrawComplete` props directly since this handler is
     * registered once here (effect depends only on `locale`, matching the
     * crosshair handler above) and must still see whichever tool is
     * CURRENTLY armed, not whichever was armed at chart-creation time.
     */
    function handleClick(param: MouseEventParams<Time>) {
      const tool = drawToolRef.current;
      const main = mainSeriesRef.current;
      if (!tool || !main || !param.point || param.time == null) return;
      // Bug fix (live report/screenshot): drawing tools only make sense on
      // the main price pane (index 0). RSI's pane is a 0-100 scale and
      // MACD's is a small oscillator range — both totally unrelated to the
      // main series' price scale, so a click in either used to still run
      // through `main.coordinateToPrice(param.point.y)` (pane-relative y,
      // interpreted against the WRONG pane's scale) and produced wildly
      // wrong prices, e.g. an "H-Line" landing near the top of the main
      // scale no matter where in the RSI pane was actually clicked. Ignore
      // clicks outside pane 0 entirely rather than try to guess a mapping
      // that doesn't exist.
      if (param.paneIndex !== 0) return;

      const price = main.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = param.time;

      if (tool === "horizontal") {
        const line = main.createPriceLine({
          price,
          color: DRAW_COLOR,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "H-Line",
        });
        drawnPriceLinesRef.current.push(line);
        onDrawCompleteRef.current?.();
        return;
      }

      const start = drawStartRef.current;
      if (!start) {
        drawStartRef.current = { time, price };
        return;
      }
      drawStartRef.current = null;

      if (tool === "trendline") {
        const points = [
          { time: start.time, value: start.price },
          { time, value: price },
        ].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
        // Two identical-time clicks would violate lightweight-charts'
        // strictly-ascending-time requirement for a 2-point series — bail
        // rather than crash the chart.
        if (points[0].time === points[1].time) {
          onDrawCompleteRef.current?.();
          return;
        }
        const chartInstance = chartRef.current;
        if (!chartInstance) return;
        const series = chartInstance.addSeries(LineSeries, {
          color: DRAW_COLOR,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        series.setData(points);
        drawnSeriesRef.current.push(series);
      } else if (tool === "fibonacci") {
        const high = Math.max(start.price, price);
        const low = Math.min(start.price, price);
        const span = high - low;
        const levels = FIB_RATIOS.map((ratio) => ({ ratio, price: high - ratio * span }));

        for (const level of levels) {
          const line = main.createPriceLine({
            price: level.price,
            color: FIB_COLOR,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${(level.ratio * 100).toFixed(1)}% · ${level.price.toFixed(2)}`,
          });
          drawnPriceLinesRef.current.push(line);
        }

        // Shaded bands between each pair of adjacent levels, confined to
        // the clicked swing's time span (matches the classic fib-box look —
        // the price LINES above still span the full chart width). A
        // translucent BaselineSeries (fills between its line value and a
        // base price) is the simplest way to render a flat horizontal band
        // with the public API, without a custom drawing primitive.
        const timesSorted = [start.time, time].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const [t0, t1] = timesSorted;
        const chartInstance = chartRef.current;
        if (chartInstance && t0 !== t1) {
          for (let i = 0; i < levels.length - 1; i++) {
            const bandTop = levels[i].price;
            const bandBottom = levels[i + 1].price;
            const band = chartInstance.addSeries(BaselineSeries, {
              baseValue: { type: "price", price: bandBottom },
              topFillColor1: hexToRgba(FIB_COLOR, 0.12),
              topFillColor2: hexToRgba(FIB_COLOR, 0.12),
              topLineColor: "rgba(0, 0, 0, 0)",
              bottomFillColor1: "rgba(0, 0, 0, 0)",
              bottomFillColor2: "rgba(0, 0, 0, 0)",
              bottomLineColor: "rgba(0, 0, 0, 0)",
              lineWidth: 1,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
            });
            band.setData([
              { time: t0, value: bandTop },
              { time: t1, value: bandTop },
            ]);
            drawnSeriesRef.current.push(band);
          }
        }
      }
      onDrawCompleteRef.current?.();
    }
    chart.subscribeClick(handleClick);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      chart.resize(Math.max(Math.floor(width), 0), Math.max(Math.floor(height), 200));
    });
    ro.observe(container);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = new Map();
      bollingerSeriesRef.current = [];
      rsiSeriesRef.current = null;
      macdSeriesRef.current = [];
      drawnSeriesRef.current = [];
      drawnPriceLinesRef.current = [];
      drawStartRef.current = null;
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
    // A previous range/mode's drawings (trendlines anchored to now-gone
    // dates, fib/h-lines on the series about to be removed) don't carry
    // forward meaningfully to a new data set — clear them here rather than
    // leave orphaned lines pointing at prices from a different timeframe.
    clearAllDrawings();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // EMA overlay toggles (50/100/150/200, any subset) — same pane as the
  // main series, alongside SMA. Rebuilt from scratch on every toggle/data
  // change (remove-then-recreate), same pattern as every other overlay in
  // this file, keyed by period in a Map so periods can be added/removed
  // independently without disturbing the others.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of emaSeriesRef.current.values()) chart.removeSeries(series);
    emaSeriesRef.current = new Map();

    for (const period of emaPeriods) {
      const points = computeEmaSeries(data, period);
      if (points.length === 0) continue;
      const series = chart.addSeries(LineSeries, {
        color: EMA_COLORS[period] ?? EMA_COLORS[50],
        lineWidth: 2,
        crosshairMarkerVisible: false,
      });
      series.setData(points);
      emaSeriesRef.current.set(period, series);
    }
    // emaPeriods is an array prop that may get a fresh identity each render
    // — depending on its sorted/joined contents (not the array reference)
    // avoids tearing down and rebuilding every EMA series on every
    // unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emaPeriods.slice().sort().join(","), data]);

  // Bollinger Bands overlay toggle — three lines (upper/middle/lower), same pane as the main series.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of bollingerSeriesRef.current) chart.removeSeries(series);
    bollingerSeriesRef.current = [];

    if (showBollinger) {
      const bands = computeBollingerBands(data, 20, 2);
      if (bands.length > 0) {
        const upper = chart.addSeries(LineSeries, {
          color: BOLLINGER_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
        });
        upper.setData(bands.map((b) => ({ time: b.time, value: b.upper })));
        const middle = chart.addSeries(LineSeries, {
          color: BOLLINGER_COLOR,
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
        });
        middle.setData(bands.map((b) => ({ time: b.time, value: b.middle })));
        const lower = chart.addSeries(LineSeries, {
          color: BOLLINGER_COLOR,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
        });
        lower.setData(bands.map((b) => ({ time: b.time, value: b.lower })));
        bollingerSeriesRef.current = [upper, middle, lower];
      }
    }
  }, [showBollinger, data]);

  // RSI + MACD sub-panes, managed together so pane indices stay consistent
  // (RSI gets pane 1 if active; MACD gets whichever of pane 1/2 is free —
  // i.e. pane 1 if RSI is off, pane 2 if RSI is also on). lightweight-charts
  // v5's chart.addSeries(definition, options, paneIndex) auto-creates a
  // pane at that index the first time it's used.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (rsiSeriesRef.current) {
      chart.removeSeries(rsiSeriesRef.current);
      rsiSeriesRef.current = null;
    }
    for (const series of macdSeriesRef.current) chart.removeSeries(series);
    macdSeriesRef.current = [];

    let nextPane = 1;

    if (showRsi) {
      const points = computeRsiSeries(data, 14);
      if (points.length > 0) {
        const rsiPane = nextPane++;
        const series = chart.addSeries(
          LineSeries,
          { color: RSI_COLOR, lineWidth: 2, crosshairMarkerVisible: false },
          rsiPane
        );
        series.setData(points);
        series.createPriceLine({ price: 70, color: "rgba(239, 68, 68, 0.5)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        series.createPriceLine({ price: 30, color: "rgba(16, 185, 129, 0.5)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
        chart.panes()[rsiPane]?.setStretchFactor(0.4);
        rsiSeriesRef.current = series;
      }
    }

    if (showMacd) {
      const { macd, signal, histogram } = computeMacd(data, 12, 26, 9);
      if (macd.length > 0) {
        const macdPane = nextPane++;
        const histSeries = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: "price", precision: 3, minMove: 0.001 } },
          macdPane
        );
        histSeries.setData(histogram);
        const macdSeries = chart.addSeries(
          LineSeries,
          { color: MACD_COLOR, lineWidth: 2, crosshairMarkerVisible: false, lastValueVisible: false },
          macdPane
        );
        macdSeries.setData(macd);
        const signalSeries = chart.addSeries(
          LineSeries,
          { color: MACD_SIGNAL_COLOR, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false },
          macdPane
        );
        signalSeries.setData(signal);
        chart.panes()[macdPane]?.setStretchFactor(0.4);
        macdSeriesRef.current = [histSeries, macdSeries, signalSeries];
      }
    }
  }, [showRsi, showMacd, data]);

  // "Clear Drawings" toolbar action — bump clearDrawingsToken to trigger.
  useEffect(() => {
    if (clearDrawingsToken > 0) clearAllDrawings();
    // clearAllDrawings intentionally excluded from deps: it's a stable
    // function of refs only (no props/state it needs to stay fresh
    // against), redeclaring it every render would just churn the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearDrawingsToken]);

  return (
    <div
      ref={containerRef}
      className={
        fullHeight
          ? "relative h-full min-h-[320px] w-full min-w-0 overflow-hidden"
          : "relative h-[320px] w-full min-w-0 overflow-hidden sm:h-[400px]"
      }
      style={drawTool ? { cursor: "crosshair" } : undefined}
      // QA fix (diagnostic: "stale hover tooltip persists after cursor
      // moves away"): lightweight-charts fires subscribeCrosshairMove with
      // an empty param (clearing the tooltip) when it detects the pointer
      // leaving its own canvas via mousemove tracking — but a fast pointer
      // exit, or the pointer leaving via a click on an element elsewhere on
      // the page (e.g. a different DataExplorerTabs tab) rather than a
      // continuous mousemove trail out through the container's edge, can
      // land outside the chart without that internal handler ever firing.
      // A plain onMouseLeave on the container is a guaranteed, library-
      // independent safety net: the browser always fires it when the
      // pointer's bounding-box exit happens, regardless of how it got
      // there, so the tooltip can never outlive the cursor being over it.
      onMouseLeave={() => setTooltip(null)}
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
