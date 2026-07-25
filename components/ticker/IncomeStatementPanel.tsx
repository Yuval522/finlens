"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowYear, IncomeStatementYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactAxis } from "@/lib/format/chart";
import { ChartCard } from "./ChartCard";

interface IncomeStatementPanelProps {
  income: IncomeStatementYear[];
  cashFlow: CashFlowYear[];
  currency: string;
}

const { success: SUCCESS, primary: PRIMARY, amber: AMBER, slate: SLATE, destructive: DESTRUCTIVE, sky: SKY } =
  CHART_COLORS;

/** Single-series bar chart used for every card in this 8-chart grid — the
 * reference dashboard shows one metric per card rather than grouped pairs
 * (Phase 5 explicitly split what used to be two combined "Gross Profit &
 * Operating Income" / "Net Income & EPS" charts into standalone cards). */
function SingleMetricChart<T extends { fiscalYear: string }>({
  data,
  dataKey,
  color,
  valueLabel,
  formatValue,
  colorByValue,
}: {
  data: T[];
  dataKey: keyof T & string;
  color: string;
  valueLabel: string;
  formatValue: (value: number) => string;
  /** When set, bars render green/red by sign instead of a flat color. */
  colorByValue?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
        <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactAxis} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value) => [formatValue(Number(value)), valueLabel]}
        />
        {/* Recharts' TypedDataKey inference can't resolve a plain `keyof T`
            string against an abstract, unconstrained generic T inside this
            wrapper (works fine for concrete types, breaks for generics) —
            passing an accessor function sidesteps that branch entirely. */}
        <Bar dataKey={(row: T) => Number(row[dataKey])} radius={[4, 4, 0, 0]} animationDuration={600} fill={color}>
          {colorByValue &&
            data.map((row, idx) => (
              <Cell key={idx} fill={Number(row[dataKey]) >= 0 ? SUCCESS : DESTRUCTIVE} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeStatementPanel({ income, cashFlow, currency }: IncomeStatementPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  const money = (v: number) => `${compactAxis(v)} ${currency}`;
  const perShare = (v: number) => `${v.toFixed(2)} ${currency}`;

  const cashFlowByYear = new Map(cashFlow.map((c) => [c.fiscalYear, c]));

  /**
   * Rule of 40 = YoY Revenue Growth % + FCF Margin % (per the Phase 5
   * spec). Falls back to Operating Margin % when a fiscal year has no
   * matching cash-flow row (e.g. a "TTM" row that fundamentalsTimeSeries
   * doesn't cover) — an EBITDA-margin proxy, since D&A isn't broken out
   * separately in this data model. First fiscal year is dropped: YoY
   * growth is undefined without a prior-year revenue figure.
   */
  const ruleOf40Data = income.slice(1).map((year, idx) => {
    const prevRevenue = income[idx].totalRevenue;
    const revenueGrowthPct = prevRevenue > 0 ? ((year.totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const cf = cashFlowByYear.get(year.fiscalYear);
    const marginPct =
      cf && year.totalRevenue > 0
        ? (cf.freeCashFlow / year.totalRevenue) * 100
        : year.totalRevenue > 0
          ? (year.operatingIncome / year.totalRevenue) * 100
          : 0;
    return {
      fiscalYear: year.fiscalYear,
      ruleOf40: Number((revenueGrowthPct + marginPct).toFixed(1)),
      usedFcf: Boolean(cf),
    };
  });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ChartCard title="Total Revenues" fullscreen={expanded === "revenue"} onToggleFullscreen={() => toggle("revenue")}>
        <SingleMetricChart data={income} dataKey="totalRevenue" color={PRIMARY} valueLabel="Revenue" formatValue={money} />
      </ChartCard>

      <ChartCard title="Gross Profit" fullscreen={expanded === "grossprofit"} onToggleFullscreen={() => toggle("grossprofit")}>
        <SingleMetricChart data={income} dataKey="grossProfit" color={SUCCESS} valueLabel="Gross Profit" formatValue={money} />
      </ChartCard>

      <ChartCard title="Operating Income" fullscreen={expanded === "opincome"} onToggleFullscreen={() => toggle("opincome")}>
        <SingleMetricChart data={income} dataKey="operatingIncome" color={AMBER} valueLabel="Operating Income" formatValue={money} />
      </ChartCard>

      <ChartCard title="Net Income" fullscreen={expanded === "netincome"} onToggleFullscreen={() => toggle("netincome")}>
        <SingleMetricChart data={income} dataKey="netIncome" color={SKY} valueLabel="Net Income" formatValue={money} />
      </ChartCard>

      <ChartCard title="EPS (Diluted)" fullscreen={expanded === "eps"} onToggleFullscreen={() => toggle("eps")}>
        <SingleMetricChart data={income} dataKey="eps" color={SUCCESS} valueLabel="EPS" formatValue={perShare} />
      </ChartCard>

      <ChartCard
        title="Shares Outstanding (Diluted)"
        fullscreen={expanded === "shares"}
        onToggleFullscreen={() => toggle("shares")}
      >
        <SingleMetricChart
          data={income}
          dataKey="sharesOutstandingDiluted"
          color={SLATE}
          valueLabel="Diluted Shares"
          formatValue={compactAxis}
        />
      </ChartCard>

      <ChartCard
        title="Rule of 40"
        subtitle="Revenue growth % + FCF margin %"
        fullscreen={expanded === "ruleof40"}
        onToggleFullscreen={() => toggle("ruleof40")}
      >
        {ruleOf40Data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ruleOf40Data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="fiscalYear" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
              <ReferenceLine y={40} stroke={AMBER} strokeDasharray="4 4" />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value, _name, item) => [
                  `${Number(value).toFixed(1)}%${item?.payload?.usedFcf ? "" : " (op. margin proxy)"}`,
                  "Rule of 40",
                ]}
              />
              <Bar dataKey="ruleOf40" radius={[4, 4, 0, 0]} animationDuration={600}>
                {ruleOf40Data.map((row) => (
                  <Cell key={row.fiscalYear} fill={row.ruleOf40 >= 40 ? SUCCESS : DESTRUCTIVE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Not enough history to compute YoY growth.
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Dividends Per Share"
        fullscreen={expanded === "dividends"}
        onToggleFullscreen={() => toggle("dividends")}
      >
        <SingleMetricChart
          data={income}
          dataKey="dividendsPerShare"
          color={AMBER}
          valueLabel="Dividends / Share"
          formatValue={perShare}
        />
      </ChartCard>
    </div>
  );
}
