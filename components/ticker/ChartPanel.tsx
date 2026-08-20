"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AreaChart,
  CandlestickChart,
  Eraser,
  Grid3x3,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  TrendingUp,
  Waypoints,
} from "lucide-react";
import { PriceChart, type ChartMode, type DrawTool } from "./PriceChart";
import { TIME_RANGES, type TimeRange } from "./TimeRangeSelector";
import { currencySymbol, formatPercent, formatPrice, toDisplayUnit } from "@/lib/format/currency";
import { isTaseListing } from "@/lib/finance/exchange";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/lib/finance/types";

/** Chart color picker presets — a flat accent color overrides the default green-gain/red-loss coloring. */
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Classic Blue", hex: "#3B82F6" },
  { name: "Emerald Green", hex: "#10B981" },
  { name: "Electric Purple", hex: "#A855F7" },
  { name: "Amber Gold", hex: "#F59E0B" },
];

/** Selectable EMA overlay periods, in display order — see PriceChart.tsx's EMA_COLORS for each period's line color. */
const EMA_PERIODS = [50, 100, 150, 200];

interface ChartPanelProps {
  history: PricePoint[];
  currency: string | null;
  /** Used to pick the chart's date-axis locale — he-IL only for TASE listings. */
  symbol: string;
  exchange: string | null;
  /** Raw (un-divided) live quote price — same convention as PriceHeaderBlock's
   *  formatPrice(quote.price, quote.currency) call, for the top-left ticker
   *  + price label. `null` while the live quote hasn't loaded yet. */
  currentPrice?: number | null;
}

function sliceByRange(history: PricePoint[], range: TimeRange): PricePoint[] {
  if (history.length === 0) return history;

  if (range === "Max") return history;

  if (range === "YTD") {
    const currentYear = new Date(history[history.length - 1].date).getUTCFullYear();
    const sliced = history.filter(
      (point) => new Date(point.date).getUTCFullYear() === currentYear
    );
    return sliced.length > 1 ? sliced : history.slice(-30);
  }

  const tradingDaysByRange: Record<Exclude<TimeRange, "Max" | "YTD">, number> = {
    "1D": 2,
    "5D": 5,
    "1M": 22,
    "6M": 126,
    "1Y": 252,
    "3Y": 756,
    "5Y": 1260,
    "10Y": 2520,
  };

  const days = tradingDaysByRange[range as Exclude<TimeRange, "Max" | "YTD">];
  return history.slice(-days);
}

/**
 * Apple-style pill toggle — shared by the range buttons, indicator toggles
 * (SMA/EMA/Bollinger/RSI/MACD), and the drawing-tool chips (trendline/
 * fibonacci/h-line) in the single-row toolbar. Solid glowing primary-color
 * fill when active/armed, translucent glass otherwise — same active-state
 * language (bg-primary + soft primary shadow) already used for the
 * sidebar's active nav item, so this reads as one consistent "on" state
 * across the whole app rather than a one-off style. `shrink-0` always on,
 * since every one of these lives inside the toolbar's horizontally
 * scrolling row and must never wrap or compress.
 */
function PillToggle({
  label,
  icon,
  active,
  onClick,
  title,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title ?? label}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-all duration-200",
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_14px_-3px] shadow-primary/70"
          : "bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Thin vertical separator between logical control groups in the single-row toolbar. */
function ToolbarDivider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />;
}

export function ChartPanel({ history, currency, symbol, exchange, currentPrice = null }: ChartPanelProps) {
  const [range, setRange] = useState<TimeRange>("1Y");
  const [mode, setMode] = useState<ChartMode>("area");
  const [showSma, setShowSma] = useState(false);
  const [emaPeriods, setEmaPeriods] = useState<number[]>([]);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [chartColor, setChartColor] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const [clearDrawingsToken, setClearDrawingsToken] = useState(0);

  function toggleEma(period: number) {
    setEmaPeriods((prev) => (prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]));
  }

  // Fullscreen expand: toggles the SAME card between its normal inline
  // position and a `fixed inset-*` overlay, rather than portaling/
  // remounting a second copy — the chart element itself never unmounts, so
  // zoom/pan position, drawn trendlines, and every toggle above survive the
  // transition in both directions with zero extra state-syncing code.
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  // Escape cancels whichever "modal-ish" state is active — an armed
  // drawing tool first (so a stray Escape while sketching a trendline
  // doesn't also blow away fullscreen), otherwise fullscreen itself.
  useEffect(() => {
    if (!drawTool && !fullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (drawTool) setDrawTool(null);
      else if (fullscreen) setFullscreen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawTool, fullscreen]);

  // Mobile UX audit fix: the color picker used to be a permanently-open
  // row of five 14px swatch buttons crammed next to the SMA/grid toggles
  // and mode buttons — both a touch-target problem (14px is well under
  // the ~44px minimum recommended tap size) and a row-crowding problem on
  // narrow phone widths. Collapsed into a single 44px trigger that opens a
  // small popover with 44px swatch buttons instead — same click-outside
  // pattern already used by the search comboboxes (SymbolSearchInput,
  // ComparePanel's inline search) elsewhere in this codebase.
  useEffect(() => {
    if (!colorPickerOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setColorPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [colorPickerOpen]);

  // QA hotfix (Phase 4): date-axis locale is market-aware now — Hebrew only
  // for TASE listings, English everywhere else (was previously left unset,
  // so it silently inherited the browser's own locale for every symbol).
  const locale = isTaseListing(symbol, exchange) ? "he-IL" : "en-US";

  // periodChange: absolute + percent move from the FIRST to the LAST point
  // of whatever's currently sliced into view — i.e. exactly the return over
  // the selected timeframe (1D/5D/.../Max), recomputed automatically every
  // time `range` changes since it's derived in the same useMemo as
  // `slicedData`. `first`/`last` are already display-unit-converted here
  // (toDisplayUnit applied below), so periodChange.abs must NOT be run
  // through toDisplayUnit again when rendering — see the render section.
  const { slicedData, positive, periodChange } = useMemo(() => {
    const sliced = sliceByRange(history, range);
    const converted: PricePoint[] = sliced.map((point) => ({
      date: point.date,
      open: toDisplayUnit(point.open, currency),
      high: toDisplayUnit(point.high, currency),
      low: toDisplayUnit(point.low, currency),
      close: toDisplayUnit(point.close, currency),
    }));
    const first = converted[0]?.close ?? 0;
    const last = converted[converted.length - 1]?.close ?? 0;
    const change =
      converted.length >= 2 && Number.isFinite(first) && first !== 0
        ? { abs: last - first, pct: ((last - first) / Math.abs(first)) * 100 }
        : null;
    return { slicedData: converted, positive: last >= first, periodChange: change };
  }, [history, range, currency]);

  return (
    <>
      {fullscreen && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "hig-card p-4 transition-[inset] duration-300 ease-out sm:p-5",
          fullscreen
            ? "fixed inset-3 z-[91] flex flex-col overflow-y-auto sm:inset-6 lg:inset-10"
            : "relative"
        )}
      >
        {/* Top-left ticker + live price header, matching institutional
            terminal charts (e.g. "T 400.04"). Also carries the selected
            timeframe's performance readout and the fullscreen toggle on the
            right — live report: these used to sit on the toolbar's own row,
            competing for space with the timeframe buttons; moving them up
            here freed that whole row for controls only (see the single-row
            toolbar below). currentPrice is the raw (un-divided) live quote
            price, same convention PriceHeaderBlock already uses, so
            formatPrice's own currency divisor applies once here rather than
            double-converting. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{symbol}</span>
            {currentPrice != null && (
              <span className="font-mono text-lg font-bold text-foreground">{formatPrice(currentPrice, currency)}</span>
            )}
            {periodChange && (
              <span
                className={cn(
                  "shrink-0 font-mono text-sm font-semibold",
                  periodChange.abs >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {/* periodChange.abs is already display-unit-converted (see the
                    useMemo above) — currencySymbol() only, no formatPrice/
                    toDisplayUnit here, or the divisor would apply twice. */}
                ({periodChange.abs >= 0 ? "+" : "-"}
                {currencySymbol(currency)}
                {Math.abs(periodChange.abs).toFixed(2)} {formatPercent(periodChange.pct)})
              </span>
            )}
          </div>
          {/* Fullscreen expand/collapse — top-right, same corner every OS/
              photo-viewer convention puts it in. */}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit fullscreen" : "Expand chart to fullscreen"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-muted-foreground transition-all duration-200 hover:bg-white/10 hover:text-foreground"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/*
          Single-row compact toolbar (live report): every control — the
          timeframe selector, every indicator toggle, grid/color/mode, and
          every drawing tool — now lives in ONE horizontally scrollable
          strip instead of stacking across a header row, a controls row,
          and an expandable drawer. `orange-scrollbar` is the same visible-
          scrollbar utility the Home dashboard's Market Summary row already
          uses (app/globals.css), so a scrollable toolbar reads as an
          established app pattern rather than a one-off. Every child is
          `shrink-0` so nothing wraps or compresses — the row scrolls
          instead, which is exactly what keeps the chart canvas below at
          its full height regardless of how many tools are toggled on.
        */}
        <div className="orange-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md">
          {TIME_RANGES.map((r) => (
            <PillToggle key={r} label={r} active={range === r} onClick={() => setRange(r)} />
          ))}

          <ToolbarDivider />

          <PillToggle label="SMA 20" active={showSma} onClick={() => setShowSma((v) => !v)} />
          {EMA_PERIODS.map((period) => (
            <PillToggle
              key={period}
              label={`EMA ${period}`}
              active={emaPeriods.includes(period)}
              onClick={() => toggleEma(period)}
            />
          ))}
          <PillToggle label="Bollinger Bands" active={showBollinger} onClick={() => setShowBollinger((v) => !v)} />
          <PillToggle label="RSI" active={showRsi} onClick={() => setShowRsi((v) => !v)} />
          <PillToggle label="MACD" active={showMacd} onClick={() => setShowMacd((v) => !v)} />

          <ToolbarDivider />

          <PillToggle
            label="Grid"
            icon={<Grid3x3 className="h-3.5 w-3.5" />}
            active={showGrid}
            onClick={() => setShowGrid((v) => !v)}
            title="הצג/הסתר רשת — toggle chart grid lines"
          />

          {/* Color picker: a single trigger that opens a small popover with
              44px swatch buttons (touch-target size fix from an earlier
              mobile-UX audit — kept as-is here). */}
          <div ref={colorPickerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setColorPickerOpen((v) => !v)}
              aria-expanded={colorPickerOpen}
              aria-haspopup="true"
              aria-label="Chart color"
              title="Chart color"
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white/[0.04] px-3 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={
                  chartColor
                    ? { backgroundColor: chartColor }
                    : { background: "linear-gradient(135deg, #10B981 50%, #EF4444 50%)" }
                }
              />
              <Palette className="h-3.5 w-3.5" />
            </button>
            {colorPickerOpen && (
              <div
                role="group"
                aria-label="Chart color options"
                className="search-dropdown-panel absolute left-0 top-[calc(100%+4px)] z-50 flex items-center gap-1 rounded-lg border border-border p-1 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    setChartColor(null);
                    setColorPickerOpen(false);
                  }}
                  aria-pressed={chartColor === null}
                  title="Auto (trend color)"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors ${
                    chartColor === null ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ background: "linear-gradient(135deg, #10B981 50%, #EF4444 50%)" }}
                  />
                </button>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => {
                      setChartColor(preset.hex);
                      setColorPickerOpen(false);
                    }}
                    aria-pressed={chartColor === preset.hex}
                    title={preset.name}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors ${
                      chartColor === preset.hex ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: preset.hex }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center rounded-full border border-foreground/10 p-0.5">
            <button
              type="button"
              aria-pressed={mode === "area"}
              onClick={() => setMode("area")}
              title="Area mode"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                mode === "area"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AreaChart className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-pressed={mode === "candlestick"}
              onClick={() => setMode("candlestick")}
              title="Candlestick mode"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                mode === "candlestick"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CandlestickChart className="h-4 w-4" />
            </button>
          </div>

          <ToolbarDivider />

          {/* Drawing tools — single-select "arm one tool, draw once,
              auto-disarm" group. See PriceChart.tsx's chart.subscribeClick
              handler for what each tool actually does on click. */}
          <PillToggle
            label="Trendline"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            active={drawTool === "trendline"}
            onClick={() => setDrawTool((t) => (t === "trendline" ? null : "trendline"))}
            title="Click a start point, then an end point, to draw a trendline"
          />
          <PillToggle
            label="Fibonacci"
            icon={<Waypoints className="h-3.5 w-3.5" />}
            active={drawTool === "fibonacci"}
            onClick={() => setDrawTool((t) => (t === "fibonacci" ? null : "fibonacci"))}
            title="Click a swing high and a swing low (either order) to draw a Fibonacci retracement"
          />
          <PillToggle
            label="H-Line"
            icon={<Minus className="h-3.5 w-3.5" />}
            active={drawTool === "horizontal"}
            onClick={() => setDrawTool((t) => (t === "horizontal" ? null : "horizontal"))}
            title="Click once to place a horizontal price line"
          />
          <button
            type="button"
            onClick={() => setClearDrawingsToken((t) => t + 1)}
            title="Clear all drawings"
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.04] px-3 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-destructive/15 hover:text-destructive"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>

        <div className={cn("mt-4", fullscreen && "min-h-0 flex-1")}>
          <PriceChart
            data={slicedData}
            mode={mode}
            showSma={showSma}
            emaPeriods={emaPeriods}
            showBollinger={showBollinger}
            showRsi={showRsi}
            showMacd={showMacd}
            drawTool={drawTool}
            onDrawComplete={() => setDrawTool(null)}
            clearDrawingsToken={clearDrawingsToken}
            positive={positive}
            locale={locale}
            showGrid={showGrid}
            overrideColor={chartColor}
            fullHeight={fullscreen}
          />
        </div>
      </div>
    </>
  );
}
