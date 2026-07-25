"use client";

import { useMemo, useState } from "react";
import { AreaChart, CandlestickChart } from "lucide-react";
import { PriceChart, type ChartMode } from "./PriceChart";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";
import { toDisplayUnit } from "@/lib/format/currency";
import type { PricePoint } from "@/lib/finance/types";

interface ChartPanelProps {
  history: PricePoint[];
  currency: string | null;
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

export function ChartPanel({ history, currency }: ChartPanelProps) {
  const [range, setRange] = useState<TimeRange>("1Y");
  const [mode, setMode] = useState<ChartMode>("area");
  const [showSma, setShowSma] = useState(false);

  const { slicedData, positive } = useMemo(() => {
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
    return { slicedData: converted, positive: last >= first };
  }, [history, range, currency]);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TimeRangeSelector value={range} onChange={setRange} />

        <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>SMA 20</span>
            <button
              type="button"
              role="switch"
              aria-checked={showSma}
              onClick={() => setShowSma((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                showSma ? "bg-primary" : "bg-accent"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  showSma ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <div className="flex items-center rounded-lg border border-slate-800/80 p-0.5">
            <button
              type="button"
              aria-pressed={mode === "area"}
              onClick={() => setMode("area")}
              title="Area mode"
              className={`rounded-md p-1.5 transition-colors ${
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
              className={`rounded-md p-1.5 transition-colors ${
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
        <PriceChart data={slicedData} mode={mode} showSma={showSma} positive={positive} />
      </div>
    </div>
  );
}
