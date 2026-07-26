"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BalanceSheetYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import { filterByRange, toYoY, type ChartRange, type ChartView } from "@/lib/finance/chart-transform";
import { ChartCard } from "./ChartCard";
import { ChartControls } from "./ChartControls";
import { SourceAttributionBadge } from "./SourceAttributionBadge";

interface BalanceSheetPanelProps {
  balance: BalanceSheetYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, destructive: DESTRUCTIVE, sky: SKY } = CHART_COLORS;

export function BalanceSheetPanel({ balance, currency }: BalanceSheetPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  // QA feature (fullscreen chart modal controls) — same shared Range/View
  // pattern as IncomeStatementPanel; see that file's doc comment. Balance
  // Sheet's charts are multi-series, so `toYoY` is called per-chart with
  // that chart's specific keys rather than once globally.
  // QA fix ("Select Range does nothing" report): default "All" instead of
  // a hardcoded 5 — see IncomeStatementPanel.tsx's matching comment.
  const [range, setRange] = useState<ChartRange>("All");
  const [view, setView] = useState<ChartView>("absolute");

  const rangedBalance = useMemo(() => filterByRange(balance, range), [balance, range]);

  function chartData(keys: (keyof BalanceSheetYear)[]) {
    return view === "yoy" ? toYoY(rangedBalance, keys) : rangedBalance;
  }

  const axisFormatter = view === "yoy" ? (v: number) => `${v}%` : compactAxis;
  const tooltipFormatter = (value: unknown) =>
    view === "yoy" ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%` : `${compactAxis(Number(value))} ${currency}`;

  const controls = (
    <ChartControls
      range={range}
      onRangeChange={setRange}
      view={view}
      onViewChange={setView}
      totalYears={balance.length}
    />
  );

  return (
    <div className="space-y-2">
      <SourceAttributionBadge years={balance} />
      {/* Phase 5: 3-column breakdown (Short-Term Position / Total Structure /
          Debt vs Liquidity), replacing the earlier 2-chart layout.
          QA fix: auto-fit/minmax instead of a viewport breakpoint — see the
          matching comment in IncomeStatementPanel.tsx for the root cause
          (this grid's real available width is the right-hand analysis column,
          not the full viewport). */}
      <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
      <ChartCard
        title="Short-Term Position"
        subtitle="Cash & ST Investments vs Current Assets vs Current Liabilities"
        fullscreen={expanded === "short-term"}
        onToggleFullscreen={() => toggle("short-term")}
        controls={controls}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData(["cashAndShortTermInvestments", "totalCurrentAssets", "totalCurrentLiabilities"])}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            {/* QA fix: explicit type="category" — see IncomeStatementPanel.tsx's matching comment. */}
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={axisFormatter} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={tooltipFormatter}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="cashAndShortTermInvestments"
              name="Cash & ST Investments"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={28}
              maxBarSize={36}
            />
            <Bar
              dataKey="totalCurrentAssets"
              name="Total Current Assets"
              fill={SKY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={28}
              maxBarSize={36}
            />
            <Bar
              dataKey="totalCurrentLiabilities"
              name="Total Current Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={28}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Total Structure"
        subtitle="Assets vs Liabilities vs Equity"
        fullscreen={expanded === "structure"}
        onToggleFullscreen={() => toggle("structure")}
        controls={controls}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData(["totalAssets", "totalLiabilities", "totalStockholdersEquity"])}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            {/* QA fix: explicit type="category" — see IncomeStatementPanel.tsx's matching comment. */}
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={axisFormatter} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={tooltipFormatter}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalAssets" name="Total Assets" fill={SKY} radius={[4, 4, 0, 0]} animationDuration={600} barSize={28} maxBarSize={36} />
            <Bar
              dataKey="totalLiabilities"
              name="Total Liabilities"
              fill={DESTRUCTIVE}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={28}
              maxBarSize={36}
            />
            <Bar
              dataKey="totalStockholdersEquity"
              name="Stockholders' Equity"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={28}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Debt vs Liquidity"
        subtitle="Total Debt vs Cash & ST Investments"
        fullscreen={expanded === "debt-liquidity"}
        onToggleFullscreen={() => toggle("debt-liquidity")}
        controls={controls}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData(["totalDebt", "cashAndShortTermInvestments"])}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            {/* QA fix: explicit type="category" — see IncomeStatementPanel.tsx's matching comment. */}
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={axisFormatter} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={tooltipFormatter}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalDebt" name="Total Debt" fill={DESTRUCTIVE} radius={[4, 4, 0, 0]} animationDuration={600} barSize={36} maxBarSize={48} />
            <Bar
              dataKey="cashAndShortTermInvestments"
              name="Cash & ST Investments"
              fill={SUCCESS}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              barSize={36}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>
    </div>
  );
}
