"use client";

import { AlertTriangle, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { computeInsights, type Insight, type InsightSentiment } from "@/lib/finance/insights";
import type {
  BalanceSheetYear,
  CashFlowYear,
  EstimatesBundle,
  IncomeStatementYear,
  TickerMetrics,
} from "@/lib/finance/types";

interface AIInsightsPanelProps {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  estimates: EstimatesBundle;
  metrics: TickerMetrics;
  currency: string;
}

const SENTIMENT_STYLES: Record<InsightSentiment, { badge: string; icon: React.ReactNode; ring: string }> = {
  positive: {
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    ring: "shadow-[0_0_16px_rgba(16,185,129,0.12)]",
  },
  neutral: {
    badge: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    icon: <Minus className="h-3.5 w-3.5" />,
    ring: "",
  },
  negative: {
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    icon: <TrendingDown className="h-3.5 w-3.5" />,
    ring: "shadow-[0_0_16px_rgba(244,63,94,0.10)]",
  },
};

function InsightCard({ insight }: { insight: Insight }) {
  const style = SENTIMENT_STYLES[insight.sentiment];
  return (
    <div className={`glass-card min-w-0 rounded-xl p-4 ${style.ring}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{insight.title}</h3>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
        >
          {style.icon}
          {insight.headline}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{insight.summary}</p>
    </div>
  );
}

export function AIInsightsPanel({ income, balance, cashFlow, estimates, metrics, currency }: AIInsightsPanelProps) {
  const insights = computeInsights({ income, balance, cashFlow, estimates, metrics, currency });

  return (
    <div className="space-y-4">
      <div className="glass-card flex items-start gap-3 rounded-xl p-3 sm:p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Automated analysis computed directly from this company&apos;s reported fundamentals — growth, margins,
          balance sheet, cash flow quality, valuation, and analyst track record — using fixed, documented rules
          rather than a live external AI model (no AI provider key is configured for this app). Not investment
          advice.
        </p>
      </div>

      {insights.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center gap-2 rounded-xl py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Not enough historical data to generate insights yet.</p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
