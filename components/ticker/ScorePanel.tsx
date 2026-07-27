"use client";

import { CheckCircle2, Gauge, XCircle } from "lucide-react";
import { computeCompositeScore, computePiotroskiScore } from "@/lib/finance/score";
import type { BalanceSheetYear, CashFlowYear, IncomeStatementYear, TickerMetrics } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

interface ScorePanelProps {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  metrics: TickerMetrics;
  currency: string;
}

function scoreTone(score: number | null): "good" | "ok" | "bad" | "none" {
  if (score == null) return "none";
  if (score >= 70) return "good";
  if (score >= 40) return "ok";
  return "bad";
}

const TONE_BAR: Record<"good" | "ok" | "bad" | "none", string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-500",
  bad: "bg-rose-500",
  none: "bg-muted-foreground/30",
};

const TONE_TEXT: Record<"good" | "ok" | "bad" | "none", string> = {
  good: "text-emerald-400",
  ok: "text-amber-400",
  bad: "text-rose-400",
  none: "text-muted-foreground",
};

const GRADE_BADGE: Record<string, string> = {
  A: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  B: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  C: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  D: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  F: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  "—": "border-border bg-muted text-muted-foreground",
};

function ScoreBar({ score }: { score: number | null }) {
  const tone = scoreTone(score);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className={cn("h-1.5 rounded-full transition-all", TONE_BAR[tone])}
        style={{ width: `${score ?? 0}%` }}
      />
    </div>
  );
}

export function ScorePanel({ income, balance, cashFlow, metrics, currency }: ScorePanelProps) {
  const composite = computeCompositeScore({ metrics, income, balance, cashFlow });
  const piotroski = computePiotroskiScore(income, balance, cashFlow, currency);
  const overallTone = scoreTone(composite.overall);

  return (
    <div className="space-y-4">
      <div className="glass-card flex items-start gap-3 rounded-xl p-3 sm:p-4">
        <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          A financial scoring model computed directly from this company&apos;s reported fundamentals — a 4-category
          composite health score (Valuation, Profitability, Growth, Financial Strength) and the classic 9-point
          Piotroski F-Score — using fixed, documented rules rather than sector-relative peer comparisons. Not
          investment advice.
        </p>
      </div>

      {/* Overall composite score hero */}
      <div className="glass-card rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className={cn("font-mono text-4xl font-bold", TONE_TEXT[overallTone])}>
              {composite.overall ?? "—"}
            </span>
            <span
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                GRADE_BADGE[composite.grade] ?? GRADE_BADGE["—"]
              )}
            >
              {composite.grade}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">Composite Financial Health Score</h3>
            <p className="text-xs text-muted-foreground">
              Equal-weighted average across Valuation, Profitability, Growth, and Financial Strength.
            </p>
          </div>
        </div>
      </div>

      {/* 4 category cards */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {composite.categories.map((category) => (
          <div key={category.name} className="glass-card min-w-0 rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{category.name}</h3>
              <span className={cn("font-mono text-sm font-semibold", TONE_TEXT[scoreTone(category.score)])}>
                {category.score ?? "—"}
                {category.score != null && <span className="text-muted-foreground">/100</span>}
              </span>
            </div>
            <ScoreBar score={category.score} />
            <dl className="mt-3 space-y-2">
              {category.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="font-mono text-xs font-medium text-foreground">{item.displayValue}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Piotroski F-Score */}
      <div className="glass-card min-w-0 rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Piotroski F-Score</h3>
            <p className="text-xs text-muted-foreground">
              {piotroski
                ? `9-point fundamental test comparing FY${piotroski.years[1]} to FY${piotroski.years[0]}.`
                : "9-point fundamental test — needs two full fiscal years of history."}
            </p>
          </div>
          {piotroski && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold",
                piotroski.score >= 7
                  ? GRADE_BADGE.A
                  : piotroski.score >= 4
                    ? GRADE_BADGE.C
                    : GRADE_BADGE.F
              )}
            >
              {piotroski.score} / {piotroski.maxScore}
            </span>
          )}
        </div>

        {!piotroski ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Not enough historical data to compute a Piotroski F-Score yet — needs at least two full fiscal years of
            income statement, balance sheet, and cash flow data.
          </p>
        ) : (
          <ul className="space-y-2">
            {piotroski.criteria.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className={cn("text-xs font-medium", c.passed ? "text-foreground" : "text-muted-foreground")}>
                    {c.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
