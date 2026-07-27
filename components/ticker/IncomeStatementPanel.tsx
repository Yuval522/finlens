"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowYear, IncomeStatementYear } from "@/lib/finance/types";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, compactAxis } from "@/lib/format/chart";
import {
  filterByRange,
  splitTrailingRow,
  toPctOfRevenue,
  toYoY,
  type ChartRange,
  type ChartType,
  type ChartView,
} from "@/lib/finance/chart-transform";
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

export function IncomeStatementPanel({
  income,
  cashFlow,
  incomeQuarterly = [],
  cashFlowQuarterly = [],
  currency,
}: IncomeStatementPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Chart Type: Annually/Quarterly — see ChartControls' doc comment. Only
  // real when incomeQuarterly actually has rows (SEC EDGAR 10-Qs / Yahoo /
  // FMP quarterly data); otherwise the toggle renders disabled.
  const [chartType, setChartType] = useState<ChartType>("annually");
  const quarterlyAvailable = incomeQuarterly.length > 0;
  const activeIncome = chartType === "quarterly" ? incomeQuarterly : income;
  const activeCashFlow = chartType === "quarterly" ? cashFlowQuarterly : cashFlow;
  const periodsPerYear = chartType === "quarterly" ? 4 : 1;

  // QA feature (fullscreen chart modal controls, shared across every card
  // in this panel): Select Range slices the trailing N years; View toggles
  // each single-metric chart between its absolute figure and YoY % change.
  // Real transforms over the real dataset (lib/finance/chart-transform.ts)
  // — see ChartControls' doc comment for why "Chart Type" only offers
  // Annually.
  // QA fix ("Select Range does nothing" report): default to "All" instead
  // of a hardcoded 5 — with FinLens's typical ~5-year data depth, a
  // default of 5 already silently equals "All" for most tickers, so the
  // very first thing a user saw was indistinguishable from what "All"
  // would show anyway. Defaulting to "All" is both more useful (show
  // everything available up front) and removes any chance of the initial
  // range value being invalid (see ChartControls' getAvailableRanges use
  // for why a hardcoded number could occasionally fall outside the
  // options offered for a thinner dataset).
  const [range, setRange] = useState<ChartRange>("All");
  const [view, setView] = useState<ChartView>("absolute");

  // "As a % of Revenue" only makes sense for margin-style metrics — opening
  // a chart that doesn't support it while it's active falls back to
  // Absolute rather than leaving the dropdown on an option it doesn't
  // offer (see the ChartControls showPctOfRevenue prop). YoY intentionally
  // isn't reset here — it's a valid view for every chart in this panel, so
  // it's allowed to persist across cards, unlike this narrower mode.
  const PCT_OF_REVENUE_CARDS = new Set(["grossprofit", "opincome", "netincome"]);
  const toggle = (key: string) =>
    setExpanded((cur) => {
      const next = cur === key ? null : key;
      if (next && view === "pctOfRevenue" && !PCT_OF_REVENUE_CARDS.has(next)) setView("absolute");
      return next;
    });

  const money = (v: number) => `${compactAxis(v)} ${currency}`;
  const perShare = (v: number) => `${v.toFixed(2)} ${currency}`;

  // Trailing appendix ("TTM") — pulled out before Select Range filtering so
  // it's never sliced away as one of the "N years", then always re-appended
  // after. See splitTrailingRow's doc comment in chart-transform.ts.
  const { historical: incomeHistorical, trailing: incomeTrailing } = useMemo(
    () => splitTrailingRow(activeIncome),
    [activeIncome]
  );
  const { historical: cashFlowHistorical, trailing: cashFlowTrailing } = useMemo(
    () => splitTrailingRow(activeCashFlow),
    [activeCashFlow]
  );
  const rangedIncome = useMemo(() => {
    const base = filterByRange(incomeHistorical, range, periodsPerYear);
    return incomeTrailing ? [...base, incomeTrailing] : base;
  }, [incomeHistorical, incomeTrailing, range, periodsPerYear]);
  const rangedCashFlow = useMemo(() => {
    const base = filterByRange(cashFlowHistorical, range, periodsPerYear);
    return cashFlowTrailing ? [...base, cashFlowTrailing] : base;
  }, [cashFlowHistorical, cashFlowTrailing, range, periodsPerYear]);

  function chartData(dataKey: keyof IncomeStatementYear, allowPctOfRevenue = false) {
    if (view === "yoy") return toYoY(rangedIncome, [dataKey]);
    if (view === "pctOfRevenue" && allowPctOfRevenue) return toPctOfRevenue(rangedIncome, [dataKey], "totalRevenue");
    return rangedIncome;
  }

  const cashFlowByYear = new Map(rangedCashFlow.map((c) => [c.fiscalYear, c]));

  /**
   * Rule of 40 = YoY Revenue Growth % + FCF Margin % (per the Phase 5
   * spec). Falls back to Operating Margin % when a fiscal year has no
   * matching cash-flow row (e.g. a "TTM" row that fundamentalsTimeSeries
   * doesn't cover) — an EBITDA-margin proxy, since D&A isn't broken out
   * separately in this data model. First fiscal year is dropped: YoY
   * growth is undefined without a prior-year revenue figure. Built from
   * the range-filtered income, not the raw prop — Select Range applies
   * here too. The View toggle deliberately does NOT apply to this card
   * (it's already an intrinsically YoY-flavored composite metric — see
   * showView={false} below).
   */
  const ruleOf40Data = rangedIncome.slice(1).map((year, idx) => {
    const prevRevenue = rangedIncome[idx].totalRevenue;
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

  const controls = (showView = true, showPctOfRevenue = false) => (
    <ChartControls
      range={range}
      onRangeChange={setRange}
      view={view}
      onViewChange={setView}
      showView={showView}
      showPctOfRevenue={showPctOfRevenue}
      totalYears={chartType === "quarterly" ? Math.floor(incomeHistorical.length / 4) : incomeHistorical.length}
      chartType={chartType}
      onChartTypeChange={setChartType}
      quarterlyAvailable={quarterlyAvailable}
    />
  );

  return (
    <div className="space-y-2">
      <SourceAttributionBadge years={incomeHistorical} />
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
      <ChartCard
        title="Total Revenues"
        fullscreen={expanded === "revenue"}
        onToggleFullscreen={() => toggle("revenue")}
        controls={controls()}
      >
        <SingleMetricChart data={chartData("totalRevenue")} dataKey="totalRevenue" color={PRIMARY} valueLabel="Revenue" formatValue={money} view={view} />
      </ChartCard>

      <ChartCard
        title="Gross Profit"
        fullscreen={expanded === "grossprofit"}
        onToggleFullscreen={() => toggle("grossprofit")}
        controls={controls(true, true)}
      >
        <SingleMetricChart data={chartData("grossProfit", true)} dataKey="grossProfit" color={SUCCESS} valueLabel="Gross Profit" formatValue={money} view={view} />
      </ChartCard>

      <ChartCard
        title="Operating Income"
        fullscreen={expanded === "opincome"}
        onToggleFullscreen={() => toggle("opincome")}
        controls={controls(true, true)}
      >
        <SingleMetricChart data={chartData("operatingIncome", true)} dataKey="operatingIncome" color={AMBER} valueLabel="Operating Income" formatValue={money} view={view} />
      </ChartCard>

      <ChartCard
        title="Net Income"
        fullscreen={expanded === "netincome"}
        onToggleFullscreen={() => toggle("netincome")}
        controls={controls(true, true)}
      >
        <SingleMetricChart data={chartData("netIncome", true)} dataKey="netIncome" color={SKY} valueLabel="Net Income" formatValue={money} view={view} />
      </ChartCard>

      <ChartCard
        title="EPS (Diluted)"
        fullscreen={expanded === "eps"}
        onToggleFullscreen={() => toggle("eps")}
        controls={controls()}
      >
        <SingleMetricChart data={chartData("eps")} dataKey="eps" color={SUCCESS} valueLabel="EPS" formatValue={perShare} view={view} />
      </ChartCard>

      <ChartCard
        title="Shares Outstanding (Diluted)"
        fullscreen={expanded === "shares"}
        onToggleFullscreen={() => toggle("shares")}
        controls={controls()}
      >
        <SingleMetricChart
          data={chartData("sharesOutstandingDiluted")}
          dataKey="sharesOutstandingDiluted"
          color={SLATE}
          valueLabel="Diluted Shares"
          formatValue={compactAxis}
          view={view}
        />
      </ChartCard>

      <ChartCard
        title="Rule of 40"
        subtitle="Revenue growth % + FCF margin %"
        fullscreen={expanded === "ruleof40"}
        onToggleFullscreen={() => toggle("ruleof40")}
        controls={controls(false)}
      >
        {ruleOf40Data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ruleOf40Data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
              {/* QA fix: explicit type="category" — this was already Recharts'
            default for XAxis, but the reported "bars bunched left with
            dead space" symptom matches what happens under a *numeric*
            scale (which this never was), so making it explicit removes
            any doubt and any risk from a future Recharts default change. */}
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

      <ChartCard
        title="Dividends Per Share"
        fullscreen={expanded === "dividends"}
        onToggleFullscreen={() => toggle("dividends")}
        controls={controls()}
      >
        <SingleMetricChart
          data={chartData("dividendsPerShare")}
          dataKey="dividendsPerShare"
          color={AMBER}
          valueLabel="Dividends / Share"
          formatValue={perShare}
          view={view}
        />
      </ChartCard>
      </div>
    </div>
  );
}
