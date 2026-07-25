"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/finance/types";

export type ChartMode = "area" | "candlestick";

interface PriceChartProps {
  /** Already converted to display units (e.g. agorot -> shekels) and sliced to the selected range. */
  data: PricePoint[];
  mode: ChartMode;
  showSma?: boolean;
  smaPeriod?: number;
  /** Drives area-chart gradient/line color — true = period gained, false = lost. */
  positive: boolean;
}

const SUCCESS = "#10B981";
const DESTRUCTIVE = "#EF4444";
const SMA_COLOR = "#F59E0B";

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
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      timeScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      crosshair: { mode: CrosshairMode.Normal },
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
  }, []);

  // Swap the main series whenever mode/data/direction changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }

    if (data.length === 0) return;

    if (mode === "area") {
      const series = chart.addSeries(AreaSeries, {
        lineColor: positive ? SUCCESS : DESTRUCTIVE,
        topColor: positive ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)",
        bottomColor: positive ? "rgba(16, 185, 129, 0.02)" : "rgba(239, 68, 68, 0.02)",
        lineWidth: 2,
      });
      series.setData(data.map((d) => ({ time: d.date, value: d.close })));
      mainSeriesRef.current = series;
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: SUCCESS,
        downColor: DESTRUCTIVE,
        borderVisible: false,
        wickUpColor: SUCCESS,
        wickDownColor: DESTRUCTIVE,
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
  }, [mode, data, positive]);

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

  return <div ref={containerRef} className="h-[320px] w-full sm:h-[400px]" />;
}
