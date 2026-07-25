"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
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

interface Scenario {
  key: "bear" | "base" | "bull";
  label: string;
  emoji: string;
  peField: "peLow" | "peBase" | "peHigh";
  accent: string;
  icon: typeof TrendingDown;
}

const SCENARIOS: Scenario[] = [
  { key: "bear", label: "Bear Case", emoji: "\u{1F534}", peField: "peLow", accent: "destructive", icon: TrendingDown },
  { key: "base", label: "Base Case", emoji: "\u{1F7E1}", peField: "peBase", accent: "amber", icon: Minus },
  { key: "bull", label: "Bull Case", emoji: "\u{1F7E2}", peField: "peHigh", accent: "success", icon: TrendingUp },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
      const annualReturn =
        currentPrice && currentPrice > 0 && impliedPrice > 0
          ? (Math.pow(impliedPrice / currentPrice, 1 / years) - 1) * 100
          : null;
      return { ...scenario, pe, impliedPrice, annualReturn, projectedEps };
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {results.map((r) => (
          <div key={r.key} className="glass-card rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{r.emoji}</span>
              <h4 className="text-sm font-semibold text-foreground">{r.label}</h4>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {r.pe.toFixed(1)}x P/E
              </span>
            </div>

            <p className="mt-4 font-mono text-2xl font-bold text-foreground">
              {currencySymbol(reportingCurrency)}
              {r.impliedPrice.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Implied Target Price</p>

            <div
              className={`mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                r.accent === "success"
                  ? "bg-success/10 text-success"
                  : r.accent === "destructive"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-400"
              }`}
            >
              <r.icon className="h-3.5 w-3.5" />
              {r.annualReturn != null ? `${r.annualReturn >= 0 ? "+" : ""}${r.annualReturn.toFixed(1)}%` : "—"}
              <span className="font-normal text-muted-foreground">
                / yr over {forecastYears}y
              </span>
            </div>
          </div>
        ))}
      </div>
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
