"use client";

import { useState } from "react";
import { IncomeStatementPanel } from "./IncomeStatementPanel";
import { BalanceSheetPanel } from "./BalanceSheetPanel";
import { CashFlowPanel } from "./CashFlowPanel";
import { EstimatesPanel } from "./EstimatesPanel";
import { ComparePanel } from "./ComparePanel";
import { ValuationCalculator } from "./ValuationCalculator";
import { AIInsightsPanel } from "./AIInsightsPanel";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { toDisplayUnit } from "@/lib/format/currency";
import type {
  BalanceSheetYear,
  CashFlowYear,
  EstimatesBundle,
  IncomeStatementYear,
  MarketQuote,
  TickerMetrics,
} from "@/lib/finance/types";

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
  balance: BalanceSheetYear[];
  cashFlow: CashFlowYear[];
  estimates: EstimatesBundle;
  reportingCurrency: string;
  quote: MarketQuote;
  metrics: TickerMetrics;
}

export function DataExplorerTabs({
  income,
  balance,
  cashFlow,
  estimates,
  reportingCurrency,
  quote,
  metrics,
}: DataExplorerTabsProps) {
  const [tab, setTab] = useState<Tab>("Income");
  const latestIncome = income[income.length - 1];

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
          <IncomeStatementPanel income={income} cashFlow={cashFlow} currency={reportingCurrency} />
        )}
        {tab === "Balance" && (
          <BalanceSheetPanel balance={balance} currency={reportingCurrency} />
        )}
        {tab === "Cash Flow" && (
          <CashFlowPanel cashFlow={cashFlow} currency={reportingCurrency} />
        )}
        {tab === "Estimates" && (
          <EstimatesPanel estimates={estimates} currency={reportingCurrency} />
        )}
        {tab === "Compare" && <ComparePanel initialSymbol={quote.symbol} />}
        {tab === "Valuation" && latestIncome && (
          <ValuationCalculator
            baseRevenue={latestIncome.totalRevenue}
            sharesOutstanding={latestIncome.sharesOutstandingDiluted}
            currentNetMargin={metrics.margins.netIncomeMargin}
            currentPE={metrics.financials.peRatio}
            currentPrice={quote.price != null ? toDisplayUnit(quote.price, quote.currency) : null}
            reportingCurrency={reportingCurrency}
            quoteCurrency={quote.currency}
          />
        )}
        {tab === "AI Insights" && (
          <AIInsightsPanel
            income={income}
            balance={balance}
            cashFlow={cashFlow}
            estimates={estimates}
            metrics={metrics}
            currency={reportingCurrency}
          />
        )}
        {(tab === "Reports" || tab === "Ratios") && <ComingSoon title={tab} />}
      </div>
    </div>
  );
}
