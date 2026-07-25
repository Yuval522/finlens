"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IncomeStatementPanel } from "./IncomeStatementPanel";
import { BalanceSheetPanel } from "./BalanceSheetPanel";
import { CashFlowPanel } from "./CashFlowPanel";
import { EstimatesPanel } from "./EstimatesPanel";
import { ComparePanel } from "./ComparePanel";
import { ValuationCalculator } from "./ValuationCalculator";
import { AIInsightsPanel } from "./AIInsightsPanel";
import { ReportsPanel } from "./ReportsPanel";
import { RatiosPanel } from "./RatiosPanel";
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

const FADE_PX = "20px";

/**
 * Builds an edge-fade mask that only fades the side(s) that actually have
 * more content to scroll to. QA hotfix: this used to be a single constant
 * gradient applied at both edges unconditionally, which faded the leftmost
 * tab ("Income") even at scrollLeft=0 when there was nothing hidden to its
 * left — at a glance that reads as a tab being clipped/missing, not as a
 * scroll hint, which is exactly what an audit at ~1400px desktop width
 * flagged. Fading only the edge(s) with real overflow makes the hint
 * unambiguous and stops misrepresenting fully-visible tabs as cut off.
 */
function buildEdgeFadeMask(canScrollLeft: boolean, canScrollRight: boolean): string | undefined {
  if (!canScrollLeft && !canScrollRight) return undefined;
  const left = canScrollLeft ? `transparent, black ${FADE_PX}` : "black 0";
  const right = canScrollRight ? `black calc(100% - ${FADE_PX}), transparent` : "black 100%";
  return `linear-gradient(to right, ${left}, ${right})`;
}

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

  const tabStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollAffordance = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    // Small tolerance so sub-pixel scroll rounding doesn't leave a
    // permanently-stuck fade at either end.
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    updateScrollAffordance();
    el.addEventListener("scroll", updateScrollAffordance, { passive: true });
    // Re-check on resize/content changes — this is the actual reported bug:
    // at ~1400px desktop width the strip is scrollable, at wider widths it
    // may not be, and the fade needs to reflect whichever is true right now.
    const ro = new ResizeObserver(updateScrollAffordance);
    ro.observe(el);
    window.addEventListener("resize", updateScrollAffordance);
    return () => {
      el.removeEventListener("scroll", updateScrollAffordance);
      ro.disconnect();
      window.removeEventListener("resize", updateScrollAffordance);
    };
  }, [updateScrollAffordance]);

  const edgeFadeMask = buildEdgeFadeMask(canScrollLeft, canScrollRight);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      {/*
        QA hotfix (UI/UX audit pass): the tab strip overflowed at normal
        desktop widths (~1400px), not just mobile, and the previous
        always-on edge fade actually made it *worse* — it dimmed the
        leftmost tab even when nothing was scrolled past it, which reads as
        "clipped" rather than "scroll for more". Now scroll-position-aware:
        the mask only fades an edge when there's genuinely more content past
        it (see buildEdgeFadeMask), tracked via scroll/resize/content-size
        listeners. Each tab still scrolls itself into view on click, so
        selecting a currently-hidden tab always brings it fully into frame.
      */}
      <div
        ref={tabStripRef}
        className="tab-scroll flex gap-1 border-b border-slate-800/80 pb-2"
        style={{
          maskImage: edgeFadeMask,
          WebkitMaskImage: edgeFadeMask,
        }}
        role="tablist"
      >
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={(e) => {
                setTab(t);
                e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
              }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
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
            marketCap={quote.marketCap != null ? toDisplayUnit(quote.marketCap, quote.currency) : null}
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
        {tab === "Reports" && <ReportsPanel symbol={quote.symbol} />}
        {tab === "Ratios" && <RatiosPanel income={income} balance={balance} metrics={metrics} />}
      </div>
    </div>
  );
}
