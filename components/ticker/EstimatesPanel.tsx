"use client";

import { useState } from "react";
import { CheckCircle2, Target, Users } from "lucide-react";
import type { AnalystPriceTargets, EstimatesBundle, MarketQuote } from "@/lib/finance/types";
import { compactAxis } from "@/lib/format/chart";
import { formatPrice } from "@/lib/format/currency";
import { cn } from "@/lib/utils";

interface EstimatesPanelProps {
  estimates: EstimatesBundle;
  currency: string;
  quote: MarketQuote;
  priceTargets: AnalystPriceTargets | null;
}

type Period = "Quarterly" | "Annual";

function money(value: number | null, currency: string): string {
  return value == null ? "—" : `${compactAxis(value)} ${currency}`;
}

function pct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** "strong_buy" -> "Strong Buy", "buy" -> "Buy", etc. — Yahoo's raw recommendationKey, title-cased. */
function formatRecommendationKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Buy-leaning keys/means read as bullish (emerald), sell-leaning as bearish (rose), hold as neutral (amber). */
function recommendationTone(key: string | null, mean: number | null): "bullish" | "neutral" | "bearish" {
  const k = key?.toLowerCase() ?? "";
  if (k.includes("buy")) return "bullish";
  if (k.includes("sell") || k.includes("underperform")) return "bearish";
  if (k.includes("hold") || k.includes("neutral")) return "neutral";
  // Fall back to the numeric 1 (Strong Buy) - 5 (Strong Sell) scale when the key is missing/unrecognized.
  if (mean != null) return mean <= 2.5 ? "bullish" : mean >= 3.5 ? "bearish" : "neutral";
  return "neutral";
}

const TONE_STYLES: Record<"bullish" | "neutral" | "bearish", { text: string; badge: string; bar: string }> = {
  bullish: {
    text: "text-emerald-400",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    bar: "bg-emerald-500",
  },
  neutral: {
    text: "text-amber-400",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    bar: "bg-amber-500",
  },
  bearish: {
    text: "text-rose-400",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    bar: "bg-rose-500",
  },
};

const DISTRIBUTION_SEGMENTS: {
  key: keyof NonNullable<AnalystPriceTargets["distribution"]>;
  label: string;
  color: string;
}[] = [
  { key: "strongBuy", label: "Strong Buy", color: "bg-emerald-500" },
  { key: "buy", label: "Buy", color: "bg-emerald-400/70" },
  { key: "hold", label: "Hold", color: "bg-amber-500" },
  { key: "sell", label: "Sell", color: "bg-rose-400/70" },
  { key: "strongSell", label: "Strong Sell", color: "bg-rose-500" },
];

/**
 * Current Price vs. Average Target, High/Low/Mean range, and Buy/Hold/Sell
 * consensus — computed entirely from the priceTargets already fetched into
 * the fundamentals bundle (see toPriceTargets() in yahoo.ts). Renders an
 * honest empty state instead of a card full of dashes when Yahoo has no
 * analyst coverage for this symbol at all (thin/illiquid names, some
 * foreign listings), rather than every field silently showing "—".
 */
function AnalystPriceTargetsCard({ quote, priceTargets }: { quote: MarketQuote; priceTargets: AnalystPriceTargets | null }) {
  if (!priceTargets) {
    return (
      <div className="glass-card mb-4 flex items-center gap-3 rounded-xl p-4">
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No analyst price-target coverage available for this symbol.</p>
      </div>
    );
  }

  const currentPrice = quote.price;
  const { meanTarget, medianTarget, highTarget, lowTarget, numberOfAnalysts, recommendationMean, recommendationKey, distribution } =
    priceTargets;

  const upsidePct =
    currentPrice != null && meanTarget != null && currentPrice !== 0
      ? ((meanTarget - currentPrice) / currentPrice) * 100
      : null;
  const upTone = upsidePct == null ? "neutral" : upsidePct >= 0 ? "bullish" : "bearish";

  // Position (0-100%) of a value along the Low..High track, for the range
  // bar's tick markers and current-price dot. Raw provider units are used
  // directly (not display units) since this is a ratio — the common scale
  // factor cancels out, so it's correct regardless of currency divisor.
  const rangeLow = lowTarget ?? meanTarget ?? currentPrice ?? 0;
  const rangeHigh = highTarget ?? meanTarget ?? currentPrice ?? 1;
  const span = rangeHigh - rangeLow;
  const positionPct = (value: number | null): number | null => {
    if (value == null || span <= 0) return null;
    return Math.min(100, Math.max(0, ((value - rangeLow) / span) * 100));
  };
  const currentPct = positionPct(currentPrice);
  const meanPct = positionPct(meanTarget);
  const medianPct = medianTarget != null ? positionPct(medianTarget) : null;

  const recTone = recommendationTone(recommendationKey, recommendationMean);
  const recLabel = recommendationKey ? formatRecommendationKey(recommendationKey) : null;

  const distributionTotal = distribution
    ? distribution.strongBuy + distribution.buy + distribution.hold + distribution.sell + distribution.strongSell
    : 0;

  return (
    <div className="glass-card mb-4 min-w-0 rounded-xl p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <h3 className="whitespace-nowrap text-sm font-semibold text-foreground">Analyst Price Targets</h3>
          <p className="text-xs text-muted-foreground">
            Current price vs. consensus target
            {numberOfAnalysts != null && (
              <span className="inline-flex items-center gap-1 pl-1.5">
                <Users className="h-3 w-3" />
                {numberOfAnalysts} analyst{numberOfAnalysts === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        {recLabel && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
              TONE_STYLES[recTone].badge
            )}
          >
            {recLabel}
            {recommendationMean != null && (
              <span className="font-mono text-[10px] opacity-80">({recommendationMean.toFixed(1)}/5)</span>
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Current price vs. average target */}
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current Price</p>
            <p className="font-mono text-lg font-semibold text-foreground">{formatPrice(currentPrice, quote.currency)}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg. Price Target</p>
            <p className="font-mono text-lg font-semibold text-foreground">{formatPrice(meanTarget, quote.currency)}</p>
          </div>
          {upsidePct != null && (
            <span className={cn("ml-auto shrink-0 font-mono text-sm font-semibold", TONE_STYLES[upTone].text)}>
              {upsidePct >= 0 ? "+" : ""}
              {upsidePct.toFixed(1)}%
              <span className="block text-right text-[10px] font-normal text-muted-foreground">
                {upsidePct >= 0 ? "upside" : "downside"}
              </span>
            </span>
          )}
        </div>

        {/* Low - Mean/Median - High range bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Low {formatPrice(lowTarget, quote.currency)}</span>
            <span>High {formatPrice(highTarget, quote.currency)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-rose-500/40 via-amber-500/40 to-emerald-500/40" />
            {medianPct != null && (
              <div
                className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-foreground/50"
                style={{ left: `${medianPct}%` }}
                title={`Median target: ${formatPrice(medianTarget, quote.currency)}`}
              />
            )}
            {meanPct != null && (
              <div
                className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                style={{ left: `${meanPct}%` }}
                title={`Mean target: ${formatPrice(meanTarget, quote.currency)}`}
              />
            )}
            {currentPct != null && (
              <div
                className={cn(
                  "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow",
                  TONE_STYLES[upTone].bar
                )}
                style={{ left: `${currentPct}%` }}
                title={`Current price: ${formatPrice(currentPrice, quote.currency)}`}
              />
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Dot = current price · line = mean target
            {medianTarget != null ? " · tick = median target" : ""}
          </p>
        </div>
      </div>

      {/* Buy/Hold/Sell consensus distribution */}
      {distribution && distributionTotal > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Analyst Consensus</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {DISTRIBUTION_SEGMENTS.map((seg) => {
              const count = distribution[seg.key];
              if (count <= 0) return null;
              return (
                <div
                  key={seg.key}
                  className={seg.color}
                  style={{ width: `${(count / distributionTotal) * 100}%` }}
                  title={`${seg.label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {DISTRIBUTION_SEGMENTS.map((seg) => {
              const count = distribution[seg.key];
              if (count <= 0) return null;
              return (
                <span key={seg.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full", seg.color)} />
                  {seg.label} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EstimatesPanel({ estimates, currency, quote, priceTargets }: EstimatesPanelProps) {
  const [period, setPeriod] = useState<Period>("Annual");
  const rows = period === "Annual" ? estimates.annual : estimates.quarterly;

  return (
    <div className="min-w-0">
      <AnalystPriceTargetsCard quote={quote} priceTargets={priceTargets} />

      <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      {/*
        QA fix: at narrower right-column widths (~1230px total window) this
        heading used to wrap into three stacked short lines before the
        table even rendered. flex-wrap on the row lets the *row* wrap as a
        unit (heading above, toggle below) when space is tight, while
        whitespace-nowrap keeps "Analyst Revenue Estimates" itself from
        breaking mid-phrase either way.
      */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className="whitespace-nowrap text-sm font-semibold text-foreground">Analyst Revenue Estimates</h3>
          <p className="text-xs text-muted-foreground">Consensus by fiscal period</p>
        </div>
        {/* Segmented toggle */}
        <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-card/60 p-0.5">
          {(["Quarterly", "Annual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p} Estimates
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No {period.toLowerCase()} analyst estimates available for this symbol.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          {/*
            QA fix: at ~1400px desktop width (a normal laptop, not a narrow
            one) this table only showed 4-5 of its 7 columns before forcing
            horizontal scroll — the reference terminal fits all 7 at a
            comparable width. min-w dropped from 640 to 560px and every
            cell's horizontal padding tightened (px-2 -> px-1.5) buys back
            enough width for "# of Analysts" (now the shorter "# Analysts")
            to fit alongside the rest without scrolling on most desktop
            viewports; it still scrolls gracefully on genuinely narrow ones.
          */}
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
                <th className="px-1.5 py-2 font-medium">Fiscal Period Ending</th>
                <th className="px-1.5 py-2 text-right font-medium">Estimate</th>
                <th className="px-1.5 py-2 text-right font-medium">YoY Growth</th>
                <th className="px-1.5 py-2 text-right font-medium">Average</th>
                <th className="px-1.5 py-2 text-right font-medium">Low</th>
                <th className="px-1.5 py-2 text-right font-medium">High</th>
                <th className="px-1.5 py-2 text-right font-medium"># Analysts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.periodEndDate}
                  className="border-b border-slate-800/60 transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-1.5 py-2 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {row.fiscalPeriodLabel}
                      {/* Glowing beat badge inline with the period. Live
                          historical quarters are usually basis "eps" (real
                          trailing EPS actual/estimate from Yahoo's
                          earningsHistory — see toEstimates() doc comment,
                          Yahoo doesn't expose historical revenue consensus);
                          mock/demo data is basis "revenue". Labeled
                          distinctly so it's never ambiguous what beat what. */}
                      {row.isHistorical && row.beat && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.35)]">
                          <CheckCircle2 className="h-3 w-3" />
                          Beat{row.beatBasis === "eps" ? " (EPS)" : ""}
                        </span>
                      )}
                      {row.isHistorical && row.beat === false && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
                          Miss{row.beatBasis === "eps" ? " (EPS)" : ""}
                        </span>
                      )}
                      {!row.isHistorical && (
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                          Forward
                        </span>
                      )}
                    </div>
                    {row.isHistorical && row.actualRevenue != null && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Actual revenue: {money(row.actualRevenue, currency)}
                      </p>
                    )}
                    {row.isHistorical && row.epsActual != null && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        EPS: {row.epsActual.toFixed(2)}
                        {row.epsEstimate != null ? ` vs est. ${row.epsEstimate.toFixed(2)}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-foreground">
                    {money(row.revenueEstimate, currency)}
                  </td>
                  <td
                    className={`px-1.5 py-2 text-right font-mono ${
                      row.revenueYoyGrowthPct != null && row.revenueYoyGrowthPct >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {pct(row.revenueYoyGrowthPct)}
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-muted-foreground">
                    {money(row.revenueAvg, currency)}
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-muted-foreground">
                    {money(row.revenueLow, currency)}
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-muted-foreground">
                    {money(row.revenueHigh, currency)}
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-muted-foreground">
                    {row.numberOfAnalysts ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
