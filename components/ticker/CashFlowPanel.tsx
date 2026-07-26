"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import { filterByRange, toYoY, type ChartRange, type ChartView } from "@/lib/finance/chart-transform";
import { ChartCard } from "./ChartCard";
import { ChartControls } from "./ChartControls";

interface CashFlowPanelProps {
  cashFlow: CashFlowYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, amber: AMBER, destructive: DESTRUCTIVE, sky: SKY } = CHART_COLORS;

interface CashFlowTooltipPayloadEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface CashFlowTooltipProps {
  active?: boolean;
  label?: string;
  payload?: CashFlowTooltipPayloadEntry[];
  currency: string;
  view: ChartView;
}

/**
 * Rich floating glass-card tooltip (Phase 5 spec) — shows the exact dollar
 * figure for every series at the hovered fiscal year, not just the
 * compact-axis rounded value shown on the bars themselves. Typed against a
 * minimal local shape rather than recharts' own TooltipProps generic,
 * which doesn't consistently expose `payload`/`label` on the props object
 * recharts actually clones onto a custom `content` element at runtime.
 */
function CashFlowTooltip({ active, payload, label, currency, view }: CashFlowTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-card min-w-[220px] rounded-lg border !border-solid p-3 shadow-xl">
      <p className="mb-2 font-mono text-xs font-semibold text-foreground">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-mono font-medium text-foreground">
              {view === "yoy"
                ? `${entry.value >= 0 ? "+" : ""}${entry.value.toFixed(1)}%`
                : `${typeof entry.value === "number" ? entry.value.toLocaleString("en-US") : entry.value} ${currency}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashFlowPanel({ cashFlow, currency }: CashFlowPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  // QA feature (fullscreen chart modal controls) — same shared Range/View
  // pattern as IncomeStatementPanel/BalanceSheetPanel.
  // QA fix ("Select Range does nothing" report): default "All" instead of
  // a hardcoded 5 — see IncomeStatementPanel.tsx's matching comment.
  const [range, setRange] = useState<ChartRange>("All");
  const [view, setView] = useState<ChartView>("absolute");

  const rangedCashFlow = useMemo(() => filterByRange(cashFlow, range), [cashFlow, range]);

  function chartData(keys: (keyof CashFlowYear)[]) {
    return view === "yoy" ? toYoY(rangedCashFlow, keys) : rangedCashFlow;
  }

  const axisFormatter = view === "yoy" ? (v: number) => `${v}%` : compactAxis;
  const controls = (
    <ChartControls
      range={range}
      onRangeChange={setRange}
      view={view}
      onViewChange={setView}
      totalYears={cashFlow.length}
    />
  );

  return (
    // QA fix: auto-fit/minmax instead of a viewport breakpoint — see the
    // matching comment in IncomeStatementPanel.tsx for the root cause.
    <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
      <ChartCard
        title="Cash Flow Breakdown"
        subtitle="Operating CF, Free CF, Stock-Based Comp, CapEx"
        fullscreen={expanded === "breakdown"}
        onToggleFullscreen={() => toggle("breakdown")}
        className="xl:col-span-2"
        controls={controls}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData(["operatingCashFlow", "freeCashFlow", "stockBasedCompensation", "capitalExpenditures"])}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            {/* QA fix: explicit type="category" — see IncomeStatementPanel.tsx's matching comment. */}
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={axisFormatter} />
            <Tooltip
              content={<CashFlowTooltip currency={currency} view={view} />}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              cursor={{ fill: "rgba(148,163,184,0.06)" }}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="operatingCashFlow" name="Operating Cash Flow" fill={PRIMARY} radius={[4, 4, 0, 0]} animationDuration={600} barSize={22} maxBarSize={30} />
            <Bar dataKey="freeCashFlow" name="Free Cash Flow" fill={SUCCESS} radius={[4, 4, 0, 0]} animationDuration={600} barSize={22} maxBarSize={30} />
            <Bar dataKey="stockBasedCompensation" name="Stock-Based Comp" fill={AMBER} radius={[4, 4, 0, 0]} animationDuration={600} barSize={22} maxBarSize={30} />
            <Bar dataKey="capitalExpenditures" name="CapEx" fill={DESTRUCTIVE} radius={[4, 4, 0, 0]} animationDuration={600} barSize={22} maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Earnings Quality"
        subtitle="Operating Cash Flow vs Net Income"
        fullscreen={expanded === "quality"}
        onToggleFullscreen={() => toggle("quality")}
        controls={controls}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData(["operatingCashFlow", "netIncome"])} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            {/* QA fix: explicit type="category" — see IncomeStatementPanel.tsx's matching comment. */}
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={axisFormatter} />
            <Tooltip
              content={<CashFlowTooltip currency={currency} view={view} />}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              cursor={{ fill: "rgba(148,163,184,0.06)" }}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="operatingCashFlow" name="Operating Cash Flow" fill={SKY} radius={[4, 4, 0, 0]} animationDuration={600} barSize={36} maxBarSize={48} />
            <Bar dataKey="netIncome" name="Net Income" fill={PRIMARY} radius={[4, 4, 0, 0]} animationDuration={600} barSize={36} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
