"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Loader2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import { PORTFOLIO_RANGES, type PortfolioRange, type PortfolioTransaction, type PortfolioValuePoint } from "@/lib/portfolio/history";
import type { PortfolioCash, PortfolioHolding } from "@/lib/portfolio/store";

interface PortfolioValueChartProps {
  holdings: PortfolioHolding[];
  cash: PortfolioCash;
  transactions: PortfolioTransaction[];
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Line/area chart of portfolio value over time with a 1W/1M/1Y/ALL range
 * dropdown and a hover tooltip ("Today / Portfolio Value: $X").
 *
 * Transaction-Aware Historical Portfolio Value fix (live report: this chart
 * used to show an artificial straight diagonal ramp from cost basis to
 * today's value — see the retired lib/portfolio/mock-history.ts.bak). It
 * now POSTs the live holdings/cash/transaction ledger to
 * /api/portfolio/history, which replays the ledger against real historical
 * closing prices (see lib/portfolio/history.ts's reconstructPortfolioHistory
 * and its module doc comment for the day-by-day math and the legacy-data
 * bootstrap rule) and returns the actual date-by-date value the portfolio
 * was worth. Refetches whenever the range changes or the underlying
 * holdings/cash/transactions change (a buy, sell, or cash edit).
 */
export function PortfolioValueChart({ holdings, cash, transactions }: PortfolioValueChartProps) {
  const [range, setRange] = useState<PortfolioRange>("1M");
  const [data, setData] = useState<PortfolioValuePoint[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch("/api/portfolio/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Mobile state-sync fix parity: never let an intermediate cache serve
      // back a stale reconstruction after a buy/sell/cash edit changes the
      // ledger — same no-store convention as refreshLivePrices()'s /api/quotes call.
      cache: "no-store",
      body: JSON.stringify({ holdings, cash, transactions, range }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body: { points?: PortfolioValuePoint[] }) => {
        if (cancelled) return;
        setData(body.points ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setData([]);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [range, holdings, cash, transactions]);

  const startValue = data[0]?.value ?? 0;
  const endValue = data[data.length - 1]?.value ?? 0;
  const positive = endValue >= startValue;
  const lineColor = positive ? CHART_COLORS.success : CHART_COLORS.destructive;

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Portfolio Value</h3>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as PortfolioRange)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
          aria-label="Portfolio value time range"
        >
          {PORTFOLIO_RANGES.map((r) => (
            <option key={r} value={r}>
              {r === "1W" ? "1 Week" : r === "1M" ? "1 Month" : r === "1Y" ? "1 Year" : "All Time"}
            </option>
          ))}
        </select>
      </div>
      <div className="h-56 w-full sm:h-64">
        {status === "loading" && data.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reconstructing history…
          </div>
        ) : status === "error" ? (
          <div className="flex h-full w-full items-center justify-center text-center text-sm text-muted-foreground">
            Couldn&apos;t load portfolio history. Please try again shortly.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return range === "1W" || range === "1M"
                    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${compactAxis(v)}`}
                domain={["auto", "auto"]}
                width={56}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                labelFormatter={(d) => {
                  const raw = String(d);
                  const date = new Date(raw);
                  const isToday = raw === new Date().toISOString().slice(0, 10);
                  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return isToday ? `Today (${label})` : label;
                }}
                formatter={(value) => [formatUsd(Number(value)), "Portfolio Value"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#portfolioValueFill)"
                activeDot={{ r: 4 }}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
