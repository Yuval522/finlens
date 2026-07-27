"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowYear, IncomeStatementYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import { splitTrailingRow, toPctOfRevenue, toYoY, type ChartView } from "@/lib/finance/chart-transform";
import { useChartControls } from "@/lib/finance/useChartControls";
import { SourceAttributionBadge } from "./SourceAttributionBadge";
import { ChartCard } from "./ChartCard";
import { ChartControls } from "./ChartControls";

interface IncomeStatementPanelProps {
  income: IncomeStatementYear[];
  cashFlow: CashFlowYear[];
  /** Quarterly counterparts (SEC 10-Q / Yahoo / FMP) — see FundamentalsBundle
   *  in lib/finance/types.ts. Empty/omitted means Chart Type: Quarterly is
   *  disabled for this symbol (see ChartControls' quarterlyAvailable prop). */
  incomeQuarterly?: IncomeStatementYear[];
  cashFlowQuarterly?: CashFlowYear[];
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
  view = "absolute",
}: {
  data: T[];
  dataKey: keyof T & string;
  color: string;
  valueLabel: string;
  formatValue: (value: number) => string;
  /** When set, bars render green/red by sign instead of a flat color. */
  colorByValue?: boolean;
  /** QA feature (fullscreen chart controls): in YoY mode the underlying
   *  `data` has already been converted to % change by the caller — this
   *  only controls display (percent formatting + always color-by-sign,
   *  since a "how much did this grow" chart reads better colored by
   *  growth direction regardless of what the caller normally does). */
  view?: ChartView;
}) {
  const isPercentView = view === "yoy" || view === "pctOfRevenue";
  const effectiveFormat = isPercentView ? (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : formatValue;
  const effectiveLabel =
    view === "yoy" ? `${valueLabel} (YoY)` : view === "pctOfRevenue" ? `${valueLabel} (% of Revenue)` : valueLabel;
  const effectiveColorByValue = view === "yoy" ? true : colorByValue;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
        {/* QA fix: explicit type="category" — this was already Recharts'
            default for XAxis, but the reported "bars bunched left with
            dead space" symptom matches what happens under a *numeric*
            scale (which this never was), so making it explicit removes
            any doubt and any risk from a future Recharts default change. */}
        <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#64748b"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={isPercentView ? (v: number) => `${v}%` : compactAxis}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
          formatter={(value) => [effectiveFormat(Number(value)), effectiveLabel]}
          allowEscapeViewBox={{ x: true, y: true }}
        />
        {/* Recharts' TypedDataKey inference can't resolve a plain `keyof T`
            string against an abstract, unconstrained generic T inside this
            wrapper (works fine for concrete types, breaks for generics) —
            passing an accessor function sidesteps that branch entirely.
            QA fix (bar-width audit): no barSize cap meant bars scaled up to
            fill the available category band, which balloons to 100px+ when
            few categories are shown (e.g. a 3-year YoY slice) — barSize/
            maxBarSize keeps bars a sane, consistent width regardless of how
            many fiscal years are plotted. */}
        <Bar
          dataKey={(row: T) => Number(row[dataKey])}
          radius={[4, 4, 0, 0]}
          animationDuration={600}
          fill={color}
          barSize={48}
          maxBarSize={60}
        >
          {effectiveColorByValue &&
            data.map((row, idx) => (
              <Cell key={idx} fill={Number(row[dataKey]) >= 0 ? SUCCESS : DESTRUCTIVE} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface MetricCardProps {
  id: string;
  title: string;
  subtitle?: string;
  income: IncomeStatementYear[];
  incomeQuarterly: IncomeStatementYear[];
  dataKey: keyof IncomeStatementYear;
  color: string;
  valueLabel: string;
  formatValue: (value: number) => string;
  /** Also offers "As a % of Revenue" as a View option — only meaningful for margin-style metrics (Gross Profit, Operating Income, Net Income). */
  allowPctOfRevenue?: boolean;
  expanded: string | null;
  onToggle: (id: string) => void;
}

/**
 * Bug fix ("changing a control in one chart modal changes every other
 * chart"): each metric card used to read `range`/`view`/`chartType` off
 * ONE state triple owned by the whole panel, so every ChartCard rendered
 * the exact same slice of data regardless of which card the user was
 * actually looking at. Mounting useChartControls() HERE — once per
 * MetricCard instance, not once per panel — gives every card its own
 * independent useState triple. Two cards showing "Total Revenues" and
 * "Gross Profit" now happen to start out looking similar (same default
 * Select Range/View/Chart Type), not because they share state, but
 * because they were independently initialized to the same defaults.
 */
function MetricCard({
  id,
  title,
  subtitle,
  income,
  incomeQuarterly,
  dataKey,
  color,
  valueLabel,
  formatValue,
  allowPctOfRevenue = false,
  expanded,
  onToggle,
}: MetricCardProps) {
  const controls = useChartControls(income, incomeQuarterly);

  const data =
    controls.view === "yoy"
      ? toYoY(controls.ranged, [dataKey])
      : controls.view === "pctOfRevenue" && allowPctOfRevenue
        ? toPctOfRevenue(controls.ranged, [dataKey], "totalRevenue")
        : controls.ranged;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      fullscreen={expanded === id}
      onToggleFullscreen={() => onToggle(id)}
      controls={
        <ChartControls
          range={controls.range}
          onRangeChange={controls.setRange}
          view={controls.view}
          onViewChange={controls.setView}
          showPctOfRevenue={allowPctOfRevenue}
          totalYears={controls.totalYears}
          chartType={controls.chartType}
          onChartTypeChange={controls.setChartType}
          quarterlyAvailable={controls.quarterlyAvailable}
        />
      }
    >
      <SingleMetricChart data={data} dataKey={dataKey} color={color} valueLabel={valueLabel} formatValue={formatValue} view={controls.view} />
    </ChartCard>
  );
}

interface RuleOf40CardProps {
  income: IncomeStatementYear[];
  incomeQuarterly: IncomeStatementYear[];
  cashFlow: CashFlowYear[];
  cashFlowQuarterly: CashFlowYear[];
  expanded: string | null;
  onToggle: (id: string) => void;
}

/**
 * Rule of 40 = YoY Revenue Growth % + FCF Margin % (per the Phase 5 spec).
 * Falls back to Operating Margin % when a fiscal year has no matching
 * cash-flow row (e.g. a "TTM" row that fundamentalsTimeSeries doesn't
 * cover) — an EBITDA-margin proxy, since D&A isn't broken out separately
 * in this data model. First fiscal year is dropped: YoY growth is
 * undefined without a prior-year revenue figure. No View toggle (it's
 * already an intrinsically YoY-flavored composite metric).
 *
 * Own independent useChartControls instance (income-driven); cash flow is
 * range-matched to it via rangeOther() so the two series always cover the
 * same fiscal periods for THIS card specifically, without borrowing state
 * from — or leaking state to — any other card in the panel.
 */
function RuleOf40Card({ income, incomeQuarterly, cashFlow, cashFlowQuarterly, expanded, onToggle }: RuleOf40CardProps) {
  const controls = useChartControls(income, incomeQuarterly);
  const rangedCashFlow = controls.rangeOther(cashFlow, cashFlowQuarterly);
  const cashFlowByYear = new Map(rangedCashFlow.map((c) => [c.fiscalYear, c]));

  const ruleOf40Data = controls.ranged.slice(1).map((year, idx) => {
    const prevRevenue = controls.ranged[idx].totalRevenue;
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
    <ChartCard
      title="Rule of 40"
      subtitle="Revenue growth % + FCF margin %"
      fullscreen={expanded === "ruleof40"}
      onToggleFullscreen={() => onToggle("ruleof40")}
      controls={
        <ChartControls
          range={controls.range}
          onRangeChange={controls.setRange}
          showView={false}
          totalYears={controls.totalYears}
          chartType={controls.chartType}
          onChartTypeChange={controls.setChartType}
          quarterlyAvailable={controls.quarterlyAvailable}
        />
      }
    >
      {ruleOf40Data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ruleOf40Data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="fiscalYear" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
            <ReferenceLine y={40} stroke={AMBER} strokeDasharray="4 4" />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(1)}%${item?.payload?.usedFcf ? "" : " (op. margin proxy)"}`,
                "Rule of 40",
              ]}
              allowEscapeViewBox={{ x: true, y: true }}
            />
            <Bar dataKey="ruleOf40" radius={[4, 4, 0, 0]} animationDuration={600} barSize={48} maxBarSize={60}>
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
  );
}

export function IncomeStatementPanel({
  income,
  cashFlow,
  incomeQuarterly = [],
  cashFlowQuarterly = [],
  currency,
}: IncomeStatementPanelProps) {
  // Only tracks which single card is fullscreen at a time (a UI/layout
  // concern — the reference terminal never shows two modals at once) —
  // NOT chart data state, so it has no bearing on the isolation fix above.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  const money = (v: number) => `${compactAxis(v)} ${currency}`;
  const perShare = (v: number) => `${v.toFixed(2)} ${currency}`;

  // Panel-level source-attribution caption always reflects the full annual
  // dataset, independent of any individual card's own Chart Type selection
  // (there's no longer a single panel-wide "the" chart type to read it
  // from — see the MetricCard doc comment above).
  const { historical: incomeHistoricalAnnual } = useMemo(() => splitTrailingRow(income), [income]);

  return (
    <div className="space-y-2">
      <SourceAttributionBadge years={incomeHistoricalAnnual} />
      {/* QA fix (root-caused via DOM inspection against the reference
          terminal): this used to be viewport-width breakpoints
          (sm:grid-cols-2 xl:grid-cols-4), sized off the *window's* width. But
          this grid lives in the right-hand column of a `22rem 1fr` split —
          its actual available width is often much narrower than the viewport
          implies, so at common desktop sizes it was stuck at 2 columns of
          ~200px, making every bar chart read as squished/stretched. CSS
          Grid's auto-fit + minmax sizes columns off the *container's* real
          width instead, so it self-adapts correctly regardless of the split
          — no viewport breakpoints, no container-query plugin needed. */}
      <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <MetricCard
          id="revenue"
          title="Total Revenues"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="totalRevenue"
          color={PRIMARY}
          valueLabel="Revenue"
          formatValue={money}
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="grossprofit"
          title="Gross Profit"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="grossProfit"
          color={SUCCESS}
          valueLabel="Gross Profit"
          formatValue={money}
          allowPctOfRevenue
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="opincome"
          title="Operating Income"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="operatingIncome"
          color={AMBER}
          valueLabel="Operating Income"
          formatValue={money}
          allowPctOfRevenue
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="netincome"
          title="Net Income"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="netIncome"
          color={SKY}
          valueLabel="Net Income"
          formatValue={money}
          allowPctOfRevenue
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="eps"
          title="EPS (Diluted)"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="eps"
          color={SUCCESS}
          valueLabel="EPS"
          formatValue={perShare}
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="shares"
          title="Shares Outstanding (Diluted)"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="sharesOutstandingDiluted"
          color={SLATE}
          valueLabel="Diluted Shares"
          formatValue={compactAxis}
          expanded={expanded}
          onToggle={toggle}
        />

        <RuleOf40Card
          income={income}
          incomeQuarterly={incomeQuarterly}
          cashFlow={cashFlow}
          cashFlowQuarterly={cashFlowQuarterly}
          expanded={expanded}
          onToggle={toggle}
        />

        <MetricCard
          id="dividends"
          title="Dividends Per Share"
          income={income}
          incomeQuarterly={incomeQuarterly}
          dataKey="dividendsPerShare"
          color={AMBER}
          valueLabel="Dividends / Share"
          formatValue={perShare}
          expanded={expanded}
          onToggle={toggle}
        />
      </div>
    </div>
  );
}
