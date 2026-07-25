"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BalanceSheetYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactAxis } from "@/lib/format/chart";

interface BalanceSheetPanelProps {
  balance: BalanceSheetYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, destructive: DESTRUCTIVE, sky: SKY } = CHART_COLORS;

function ChartCard({
  title,
  children,
  fullscreen,
  onToggleFullscreen,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  className?: string;
}) {
  return (
    <div
      className={`glass-card min-w-0 rounded-xl p-3 sm:p-4 ${
        fullscreen ? "fixed inset-4 z-50 overflow-auto" : className
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

export function BalanceSheetPanel({ balance, currency }: BalanceSheetPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  const netCashData = balance.map((row) => ({
    fiscalYear: row.fiscalYear,
    netCashPosition: row.totalCash - row.totalDebt,
  }));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <ChartCard
        title="Short-Term Position"
        fullscreen={expanded === "short-term"}
        onToggleFullscreen={() => toggle("short-term")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={balance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value) => `${compactAxis(Number(value))} ${currency}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="cashAndShortTermInvestments"
              name="Cash & ST Investments"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="totalCurrentLiabilities"
              name="Total Current Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Total Structure"
        fullscreen={expanded === "structure"}
        onToggleFullscreen={() => toggle("structure")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={balance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value) => `${compactAxis(Number(value))} ${currency}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalAssets" name="Total Assets" fill={SKY} radius={[4, 4, 0, 0]} animationDuration={600} />
            <Bar
              dataKey="totalLiabilities"
              name="Total Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
            <Bar
              dataKey="totalStockholdersEquity"
              name="Stockholders' Equity"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Net Cash Position (Total Cash − Total Debt)"
        fullscreen={expanded === "netcash"}
        onToggleFullscreen={() => toggle("netcash")}
        className="sm:col-span-2"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={netCashData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value) => [`${compactAxis(Number(value))} ${currency}`, "Net Cash Position"]}
            />
            <Bar dataKey="netCashPosition" name="Net Cash Position" radius={[4, 4, 0, 0]} animationDuration={600}>
              {netCashData.map((entry) => (
                <Cell key={entry.fiscalYear} fill={entry.netCashPosition >= 0 ? SUCCESS : DESTRUCTIVE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
