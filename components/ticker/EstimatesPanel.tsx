"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { EstimatesBundle } from "@/lib/finance/types";
import { compactAxis } from "@/lib/format/chart";

interface EstimatesPanelProps {
  estimates: EstimatesBundle;
  currency: string;
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

export function EstimatesPanel({ estimates, currency }: EstimatesPanelProps) {
  const [period, setPeriod] = useState<Period>("Annual");
  const rows = period === "Annual" ? estimates.annual : estimates.quarterly;

  return (
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
  );
}
