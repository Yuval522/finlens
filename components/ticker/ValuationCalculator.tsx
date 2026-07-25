"use client";

import { useMemo, useState } from "react";
import { currencySymbol } from "@/lib/format/currency";

interface ValuationCalculatorProps {
  /** Latest reported annual revenue, in reportingCurrency raw units. */
  baseRevenue: number;
  /** Latest diluted shares outstanding. */
  sharesOutstanding: number;
  /** Latest reported net income margin, as a percent (e.g. 25.3 = 25.3%). */
  currentNetMargin: number | null;
  /** Latest trailing P/E, used to seed the Low/Base/High multiples. */
  currentPE: number | null;
  /** Current share price, in quote.currency raw units. */
  currentPrice: number | null;
  /** Currency the revenue/EPS/target-price figures are computed in. */
  reportingCurrency: string;
  /** Currency the live share price is quoted in — may differ (e.g. TASE dual-listings). */
  quoteCurrency: string;
}

/**
 * Reference terminal spec (iCharts /analysis/AAPL Valuation tab, inspected
 * live): three scenario cards titled exactly "Low Valuation" / "Base
 * Valuation" / "High Valuation" left-to-right, each with a fixed
 * border/title accent color — orange for Low, a slightly warmer/neutral
 * amber for Base, emerald for High.
 */
interface Scenario {
  key: "low" | "base" | "high";
  label: string;
  peField: "peLow" | "peBase" | "peHigh";
  borderClass: string;
  titleClass: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: "low",
    label: "Low Valuation",
    peField: "peLow",
    borderClass: "!border-orange-500/50",
    titleClass: "text-orange-400",
  },
  {
    key: "base",
    label: "Base Valuation",
    peField: "peBase",
    borderClass: "!border-amber-400/40",
    titleClass: "text-amber-300",
  },
  {
    key: "high",
    label: "High Valuation",
    peField: "peHigh",
    borderClass: "!border-emerald-500/50",
    titleClass: "text-emerald-400",
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "20x" for whole numbers, "24.5x" otherwise — matches the reference's plain P/E labels. */
function formatMultiple(pe: number): string {
  return `${Number.isInteger(pe) ? pe.toFixed(0) : pe.toFixed(1)}x`;
}

/** Always expressed in billions, one decimal (e.g. "$3737.5B") — matches the reference,
 *  which doesn't switch to "T" even for mega-cap market caps. */
function formatBillions(value: number, currency: string): string {
  return `${currencySymbol(currency)}${(value / 1_000_000_000).toFixed(1)}B`;
}

function ScenarioRow({
  label,
  value,
  valueClassName,
  noColon,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  noColon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">
        {label}
        {noColon ? "" : ":"}
      </span>
      <span className={valueClassName ?? "font-mono font-medium text-foreground"}>{value}</span>
    </div>
  );
}

export function ValuationCalculator({
  baseRevenue,
  sharesOutstanding,
  currentNetMargin,
  currentPE,
  currentPrice,
  reportingCurrency,
  quoteCurrency,
}: ValuationCalculatorProps) {
  const [revenueM, setRevenueM] = useState(() => round2(baseRevenue / 1_000_000));
  const [forecastYears, setForecastYears] = useState(5);
  const [growthRate, setGrowthRate] = useState(10);
  const [targetMargin, setTargetMargin] = useState(() => round2(currentNetMargin ?? 15));
  const [peLow, setPeLow] = useState(() => round2((currentPE ?? 20) * 0.7));
  const [peBase, setPeBase] = useState(() => round2(currentPE ?? 20));
  const [peHigh, setPeHigh] = useState(() => round2((currentPE ?? 20) * 1.3));

  const peValues = { peLow, peBase, peHigh };

  const results = useMemo(() => {
    const years = Math.max(1, forecastYears);
    const projectedRevenue = revenueM * 1_000_000 * Math.pow(1 + growthRate / 100, years);
    const projectedNetIncome = projectedRevenue * (targetMargin / 100);
    const projectedEps = sharesOutstanding > 0 ? projectedNetIncome / sharesOutstanding : 0;

    return SCENARIOS.map((scenario) => {
      const pe = peValues[scenario.peField];
      const impliedPrice = projectedEps * pe;
      const estimatedMarketCap = impliedPrice * sharesOutstanding;
      const annualReturn =
        currentPrice && currentPrice > 0 && impliedPrice > 0
          ? (Math.pow(impliedPrice / currentPrice, 1 / years) - 1) * 100
          : null;
      return { ...scenario, pe, impliedPrice, estimatedMarketCap, annualReturn, projectedEps };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueM, forecastYears, growthRate, targetMargin, peLow, peBase, peHigh, sharesOutstanding, currentPrice]);

  const currencyDiffers = quoteCurrency !== reportingCurrency;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Self-Serve Valuation Calculator
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label={`Base Revenue (${currencySymbol(reportingCurrency)}M)`}>
            <input
              type="number"
              value={revenueM}
              onChange={(e) => setRevenueM(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Forecast Years">
            <input
              type="number"
              min={1}
              max={20}
              value={forecastYears}
              onChange={(e) => setForecastYears(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Revenue Growth %">
            <input
              type="number"
              value={growthRate}
              onChange={(e) => setGrowthRate(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Target Net Margin %">
            <input
              type="number"
              value={targetMargin}
              onChange={(e) => setTargetMargin(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="P/E Low / High">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={peLow}
                onChange={(e) => setPeLow(Number(e.target.value))}
                className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number"
                value={peHigh}
                onChange={(e) => setPeHigh(Number(e.target.value))}
                className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </Field>
          <Field label="P/E Base">
            <input
              type="number"
              value={peBase}
              onChange={(e) => setPeBase(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
        </div>

        {currencyDiffers && (
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Note: revenue/EPS/target price are computed in {reportingCurrency}, but the live
            share price trades in {quoteCurrency} — expected annual return is illustrative,
            not FX-adjusted.
          </p>
        )}
      </div>

      {/*
        Reference terminal spec: "Target Price Scenarios" — three cards,
        exactly Low/Base/High Valuation left-to-right, each with a fixed 4-row
        layout (P/E Multiple, Target Price, Estimated Market Cap, divider,
        Annual Return). Annual Return's color is semantic (amber/orange for
        negative, green for positive) rather than tied to the card identity,
        since the same scenario can flip sign depending on the live inputs.
      */}
      <h3 className="text-sm font-semibold text-foreground">Target Price Scenarios</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {results.map((r) => {
          const returnPositive = r.annualReturn != null && r.annualReturn >= 0;
          return (
            <div key={r.key} className={`glass-card rounded-2xl border p-4 sm:p-5 ${r.borderClass}`}>
              <h4 className={`text-sm font-semibold ${r.titleClass}`}>{r.label}</h4>

              <div className="mt-3 space-y-0.5">
                <ScenarioRow label="P/E Multiple" value={formatMultiple(r.pe)} />
                <ScenarioRow
                  label="Target Price"
                  value={`${currencySymbol(reportingCurrency)}${r.impliedPrice.toFixed(1)}`}
                  valueClassName="font-mono text-base font-bold text-foreground"
                />
                <ScenarioRow
                  label="Estimated Market Cap"
                  noColon
                  value={formatBillions(r.estimatedMarketCap, reportingCurrency)}
                />
              </div>

              <div className="my-2 border-t border-slate-800/80" />

              <ScenarioRow
                label="Annual Return"
                value={r.annualReturn != null ? `${returnPositive ? "+" : ""}${r.annualReturn.toFixed(1)}%` : "—"}
                valueClassName={`font-mono font-bold ${
                  r.annualReturn == null ? "text-muted-foreground" : returnPositive ? "text-success" : "text-amber-400"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/*
        "Investment Summary" strip — reference spec: full-width, 5 columns,
        exact labels (Base Revenue / Current Price / Forecast Period /
        Revenue Growth / Target Margin), populated from the same live inputs
        already driving the cards above.
      */}
      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Investment Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <SummaryStat label="Base Revenue" value={`${currencySymbol(reportingCurrency)}${(revenueM / 1000).toFixed(2)}B`} />
          <SummaryStat
            label="Current Price"
            value={currentPrice != null ? `${currencySymbol(quoteCurrency)}${currentPrice.toFixed(2)}` : "—"}
          />
          <SummaryStat label="Forecast Period" value={`${forecastYears} years`} />
          <SummaryStat
            label="Revenue Growth"
            value={`${growthRate >= 0 ? "+" : ""}${growthRate}%`}
            valueClassName={growthRate >= 0 ? "text-success" : "text-amber-400"}
          />
          <SummaryStat label="Target Margin" value={`${targetMargin}%`} valueClassName="text-sky-400" />
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className={`font-mono text-lg font-bold ${valueClassName ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
