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
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactAxis } from "@/lib/format/chart";

interface IncomeStatementPanelProps {
  income: IncomeStatementYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, amber: AMBER, slate: SLATE } = CHART_COLORS;

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
      className={`glass-card min-w-0 rounded-xl p-3 sm:p-4 ${
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

const tooltipStyle = CHART_TOOLTIP_STYLE;

export function IncomeStatementPanel({ income, currency }: IncomeStatementPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
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
