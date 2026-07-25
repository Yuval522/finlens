"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IncomeStatementYear } from "@/lib/finance/types";

interface IncomeStatementPanelProps {
  income: IncomeStatementYear[];
  currency: string;
}

const SUCCESS = "#10B981";
const PRIMARY = "#6366F1";
const AMBER = "#F59E0B";
const SLATE = "#64748B";

function compactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${value}`;
}

function ChartCard({
  title,
  children,
  fullscreen,
  onToggleFullscreen,
}: {
  title: string;
  children: React.ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div
      className={`glass-card rounded-xl p-3 sm:p-4 ${
        fullscreen ? "fixed inset-4 z-50 overflow-auto" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={fullscreen ? "Collapse" : "Expand"}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className={fullscreen ? "h-[70vh] w-full" : "h-64 w-full"}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f1420",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  fontFamily: "var(--font-mono)",
};

export function IncomeStatementPanel({ income, currency }: IncomeStatementPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ChartCard
        title="Total Revenues"
        fullscreen={expanded === "revenue"}
        onToggleFullscreen={() => toggle("revenue")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={income} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactAxis}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [`${compactAxis(Number(value))} ${currency}`, "Revenue"]}
            />
            <Bar dataKey="totalRevenue" fill={PRIMARY} radius={[4, 4, 0, 0]} animationDuration={600} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Gross Profit & Operating Income"
        fullscreen={expanded === "profit"}
        onToggleFullscreen={() => toggle("profit")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={income} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactAxis}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${compactAxis(Number(value))} ${currency}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="grossProfit"
              name="Gross Profit"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="operatingIncome"
              name="Operating Income"
              fill={AMBER}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Net Income & EPS"
        fullscreen={expanded === "netincome"}
        onToggleFullscreen={() => toggle("netincome")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={income} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactAxis}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="netIncome"
              name="Net Income"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              yAxisId="right"
              dataKey="eps"
              name="EPS"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Shares Outstanding & Dividends / Share"
        fullscreen={expanded === "shares"}
        onToggleFullscreen={() => toggle("shares")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={income} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={compactAxis}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="sharesOutstandingDiluted"
              name="Diluted Shares"
              fill={SLATE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              yAxisId="right"
              dataKey="dividendsPerShare"
              name="Dividends / Share"
              fill={AMBER}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
