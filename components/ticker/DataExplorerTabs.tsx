"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { IncomeStatementPanel } from "./IncomeStatementPanel";
import { ComingSoon } from "@/components/shared/ComingSoon";
import type { IncomeStatementYear } from "@/lib/finance/types";

const TABS = [
  "Income",
  "Balance",
  "Cash Flow",
  "Reports",
  "Ratios",
  "Estimates",
  "Compare",
  "Valuation",
  "AI Insights",
] as const;

type Tab = (typeof TABS)[number];

interface DataExplorerTabsProps {
  income: IncomeStatementYear[];
  reportingCurrency: string;
}

export function DataExplorerTabs({ income, reportingCurrency }: DataExplorerTabsProps) {
  const [tab, setTab] = useState<Tab>("Income");

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="tab-scroll flex gap-1 border-b border-slate-800/80 pb-2" role="tablist">
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === "Income" && (
          <IncomeStatementPanel income={income} currency={reportingCurrency} />
        )}
        {tab === "AI Insights" && <ComingSoon title="AI Insights" icon={Sparkles} />}
        {tab !== "Income" && tab !== "AI Insights" && <ComingSoon title={tab} />}
      </div>
    </div>
  );
}
