"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, CandlestickChart, Grid3x3, Palette } from "lucide-react";
import { PriceChart, type ChartMode } from "./PriceChart";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";
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

export function ChartPanel({ history, currency, symbol, exchange, currentPrice = null }: ChartPanelProps) {
  const [range, setRange] = useState<TimeRange>("1Y");
  const [mode, setMode] = useState<ChartMode>("area");
  const [showSma, setShowSma] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [chartColor, setChartColor] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

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
    <div className="hig-card p-4 sm:p-5">
      {/* Top-left ticker + live price header, matching institutional
          terminal charts (e.g. "T 400.04") — sits above the toolbar, its
          own line, per the reference layout. currentPrice is the raw
          (un-divided) live quote price, same convention PriceHeaderBlock
          already uses, so formatPrice's own currency divisor applies once
          here rather than double-converting. */}
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{symbol}</span>
        {currentPrice != null && (
          <span className="font-mono text-lg font-bold text-foreground">{formatPrice(currentPrice, currency)}</span>
        )}
      </div>

      {/* Row 1: Select Range + the selected timeframe's performance
          comparison, right-aligned on the same row (per the reference
          layout: "aligned with the timeframe selector row", where a real
          terminal's drawing/compare tools would sit). Recomputed
          automatically on every range change since periodChange is
          derived alongside slicedData in the same useMemo above. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeRangeSelector value={range} onChange={setRange} />
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

      {/* QA fix (toolbar-squeeze audit), still relevant in spirit: this row
          previously had to share space with the TimeRangeSelector
          (1D/5D/.../Max), which forced a wrap/squeeze tradeoff at
          intermediate desktop widths. Select Range now has its own
          dedicated row above (paired only with the period performance
          readout, not this controls group), so this row is simply the
          SMA/grid/color/mode controls on their own line — matching the
          reference layout's two-row toolbar and no longer needing the
          squeeze workaround. */}
      {/* Mobile UX audit fix: every control below used to have a real
          tappable area well under the ~44px minimum recommended touch
          target (the SMA/grid switches were 20px tall with an
          unclickable text label next to them — a <label> wrapping a
          plain <button> does NOT forward clicks per the HTML spec, only
          real form controls get that; the five color swatches were 14px
          circles; the mode buttons were ~28px). Every control is now
          either a full min-h-11 (44px) button in its own right (SMA/grid
          toggles — the whole row including the text label is now
          clickable) or 44x44px (color trigger, popover swatches, mode
          buttons). flex-wrap on both this row and the group below it was
          already present, so nothing needed to change there — the actual
          audit finding was tap-target size, not wrapping. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={showSma}
            onClick={() => setShowSma((v) => !v)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span>SMA 20</span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                showSma ? "bg-primary" : "bg-accent"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  showSma ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={showGrid}
            aria-label="Toggle grid lines"
            title="הצג/הסתר רשת — toggle chart grid lines"
            onClick={() => setShowGrid((v) => !v)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                showGrid ? "bg-primary" : "bg-accent"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  showGrid ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          {/* Color picker: was a permanently-open row of 14px swatches —
              now a single 44px trigger that opens a small popover with
              44px swatch buttons, both fixing the touch-target size and
              decluttering this row on narrow phone widths. */}
          <div ref={colorPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setColorPickerOpen((v) => !v)}
              aria-expanded={colorPickerOpen}
              aria-haspopup="true"
              aria-label="Chart color"
              title="Chart color"
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-foreground/10 px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

          <div className="flex items-center rounded-lg border border-foreground/10 p-0.5">
            <button
              type="button"
              aria-pressed={mode === "area"}
              onClick={() => setMode("area")}
              title="Area mode"
              className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
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
              className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
                mode === "candlestick"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CandlestickChart className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PriceChart
          data={slicedData}
          mode={mode}
          showSma={showSma}
          positive={positive}
          locale={locale}
          showGrid={showGrid}
          overrideColor={chartColor}
        />
      </div>
    </div>
  );
}
