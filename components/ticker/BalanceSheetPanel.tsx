"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BalanceSheetYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import {
  filterByRange,
  splitTrailingRow,
  toYoY,
  type ChartRange,
  type ChartType,
  type ChartView,
} from "@/lib/finance/chart-transform";
import { ChartCard } from "./ChartCard";
import { ChartControls } from "./ChartControls";
import { MetricFilterControl, type MetricFilterOption } from "./MetricFilterControl";
import { SourceAttributionBadge } from "./SourceAttributionBadge";

interface BalanceSheetPanelProps {
  balance: BalanceSheetYear[];
  /** Quarterly counterpart (SEC 10-Q / Yahoo / FMP) — see FundamentalsBundle
   *  in lib/finance/types.ts. Empty/omitted disables Chart Type: Quarterly. */
  balanceQuarterly?: BalanceSheetYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, destructive: DESTRUCTIVE, sky: SKY } = CHART_COLORS;

export function BalanceSheetPanel({ balance, balanceQuarterly = [], currency }: BalanceSheetPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  // Chart Type: Annually/Quarterly — see ChartControls' doc comment.
  const [chartType, setChartType] = useState<ChartType>("annually");
  const quarterlyAvailable = balanceQuarterly.length > 0;
  const activeBalance = chartType === "quarterly" ? balanceQuarterly : balance;
  const periodsPerYear = chartType === "quarterly" ? 4 : 1;

  // QA feature (fullscreen chart modal controls) — same shared Range/View
  // pattern as IncomeStatementPanel; see that file's doc comment. Balance
  // Sheet's charts are multi-series, so `toYoY` is called per-chart with
  // that chart's specific keys rather than once globally.
  // QA fix ("Select Range does nothing" report): default "All" instead of
  // a hardcoded 5 — see IncomeStatementPanel.tsx's matching comment.
  const [range, setRange] = useState<ChartRange>("All");
  const [view, setView] = useState<ChartView>("absolute");

  // MRQ appendix (most recent quarter — a point-in-time snapshot, unlike
  // Income/Cash Flow's rolling TTM) — see splitTrailingRow's doc comment
  // and the derivation in getFundamentals() (yahoo.ts). Pulled out before
  // Select Range filtering and always re-appended, so it's never sliced
  // away as one of the "N years".
  const { historical: balanceHistorical, trailing: balanceTrailing } = useMemo(
    () => splitTrailingRow(activeBalance),
    [activeBalance]
  );
  const rangedBalance = useMemo(() => {
    const base = filterByRange(balanceHistorical, range, periodsPerYear);
    return balanceTrailing ? [...base, balanceTrailing] : base;
  }, [balanceHistorical, balanceTrailing, range, periodsPerYear]);

  function chartData(keys: (keyof BalanceSheetYear)[]) {
    return view === "yoy" ? toYoY(rangedBalance, keys) : rangedBalance;
  }

  const axisFormatter = view === "yoy" ? (v: number) => `${v}%` : compactAxis;
  const tooltipFormatter = (value: unknown) =>
    view === "yoy" ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%` : `${compactAxis(Number(value))} ${currency}`;

  const controls = (filterMetrics?: ReactNode) => (
    <ChartControls
      range={range}
      onRangeChange={setRange}
      view={view}
      onViewChange={setView}
      totalYears={chartType === "quarterly" ? Math.floor(balanceHistorical.length / 4) : balanceHistorical.length}
      chartType={chartType}
      onChartTypeChange={setChartType}
      quarterlyAvailable={quarterlyAvailable}
      filterMetrics={filterMetrics}
    />
  );

  // Filter Metrics (per-chart multi-select — see MetricFilterControl.tsx).
  // One options list + visible Set per chart since the three charts don't
  // share a metric set.
  const SHORT_TERM_OPTIONS: MetricFilterOption[] = [
    { key: "cashAndShortTermInvestments", label: "Cash & ST Investments", color: SUCCESS },
    { key: "totalCurrentAssets", label: "Total Current Assets", color: SKY },
    { key: "totalCurrentLiabilities", label: "Total Current Liabilities", color: DESTRUCTIVE },
  ];
  const [shortTermVisible, setShortTermVisible] = useState<Set<string>>(
    () => new Set(SHORT_TERM_OPTIONS.map((o) => o.key))
  );
  const toggleShortTerm = (key: string) =>
    setShortTermVisible((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const STRUCTURE_OPTIONS: MetricFilterOption[] = [
    { key: "totalAssets", label: "Total Assets", color: SKY },
    { key: "totalLiabilities", label: "Total Liabilities", color: DESTRUCTIVE },
    { key: "totalStockholdersEquity", label: "Stockholders' Equity", color: PRIMARY },
  ];
  const [structureVisible, setStructureVisible] = useState<Set<string>>(
    () => new Set(STRUCTURE_OPTIONS.map((o) => o.key))
  );
  const toggleStructure = (key: string) =>
    setStructureVisible((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const DEBT_LIQUIDITY_OPTIONS: MetricFilterOption[] = [
    { key: "totalDebt", label: "Total Debt", color: DESTRUCTIVE },
    { key: "cashAndShortTermInvestments", label: "Cash & ST Investments", color: SUCCESS },
  ];
  const [debtLiquidityVisible, setDebtLiquidityVisible] = useState<Set<string>>(
    () => new Set(DEBT_LIQUIDITY_OPTIONS.map((o) => o.key))
  );
  const toggleDebtLiquidity = (key: string) =>
    setDebtLiquidityVisible((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      <SourceAttributionBadge years={balanceHistorical} />
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
        controls={controls(
          <MetricFilterControl options={SHORT_TERM_OPTIONS} visible={shortTermVisible} onToggle={toggleShortTerm} />
        )}
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
            {shortTermVisible.has("cashAndShortTermInvestments") && (
              <Bar
                dataKey="cashAndShortTermInvestments"
                name="Cash & ST Investments"
                fill={SUCCESS}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={28}
                maxBarSize={36}
              />
            )}
            {shortTermVisible.has("totalCurrentAssets") && (
              <Bar
                dataKey="totalCurrentAssets"
                name="Total Current Assets"
                fill={SKY}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={28}
                maxBarSize={36}
              />
            )}
            {shortTermVisible.has("totalCurrentLiabilities") && (
              <Bar
                dataKey="totalCurrentLiabilities"
                name="Total Current Liabilities"
                fill={DESTRUCTIVE}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={28}
                maxBarSize={36}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Total Structure"
        subtitle="Assets vs Liabilities vs Equity"
        fullscreen={expanded === "structure"}
        onToggleFullscreen={() => toggle("structure")}
        controls={controls(
          <MetricFilterControl options={STRUCTURE_OPTIONS} visible={structureVisible} onToggle={toggleStructure} />
        )}
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
            {structureVisible.has("totalAssets") && (
              <Bar dataKey="totalAssets" name="Total Assets" fill={SKY} radius={[4, 4, 0, 0]} animationDuration={600} barSize={28} maxBarSize={36} />
            )}
            {structureVisible.has("totalLiabilities") && (
              <Bar
                dataKey="totalLiabilities"
                name="Total Liabilities"
                fill={DESTRUCTIVE}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={28}
                maxBarSize={36}
              />
            )}
            {structureVisible.has("totalStockholdersEquity") && (
              <Bar
                dataKey="totalStockholdersEquity"
                name="Stockholders' Equity"
                fill={PRIMARY}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={28}
                maxBarSize={36}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Debt vs Liquidity"
        subtitle="Total Debt vs Cash & ST Investments"
        fullscreen={expanded === "debt-liquidity"}
        onToggleFullscreen={() => toggle("debt-liquidity")}
        controls={controls(
          <MetricFilterControl
            options={DEBT_LIQUIDITY_OPTIONS}
            visible={debtLiquidityVisible}
            onToggle={toggleDebtLiquidity}
          />
        )}
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
            {debtLiquidityVisible.has("totalDebt") && (
              <Bar dataKey="totalDebt" name="Total Debt" fill={DESTRUCTIVE} radius={[4, 4, 0, 0]} animationDuration={600} barSize={36} maxBarSize={48} />
            )}
            {debtLiquidityVisible.has("cashAndShortTermInvestments") && (
              <Bar
                dataKey="cashAndShortTermInvestments"
                name="Cash & ST Investments"
                fill={SUCCESS}
                radius={[4, 4, 0, 0]}
                animationDuration={600}
                barSize={36}
                maxBarSize={48}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>
    </div>
  );
}
