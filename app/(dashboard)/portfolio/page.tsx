"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Briefcase, Plus } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio/store";
import { computePortfolioTotals, USD_TO_ILS_RATE } from "@/lib/portfolio/derive";
import { formatPercent } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { useBackgroundRefresh } from "@/lib/finance/useBackgroundRefresh";
import { CurrencyToggle } from "@/components/portfolio/CurrencyToggle";
import { AddStockModal } from "@/components/portfolio/AddStockModal";
import { PortfolioValueChart } from "@/components/portfolio/PortfolioValueChart";
import { AssetAllocationChart } from "@/components/portfolio/AssetAllocationChart";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";

function money(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyIls(v: number): string {
  return `₪${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortfolioPage() {
  const { holdings, cash, removeHolding, refreshLivePrices } = usePortfolio();
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "ILS">("USD");
  const [modalOpen, setModalOpen] = useState(false);

  // Best-effort live refresh of held symbols' prices on mount — updates and
  // persists currentPrice/changePercent when the fetch succeeds, silently
  // keeps the seeded/last-known values when it can't (see store.ts).
  useEffect(() => {
    refreshLivePrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Freshness fix ("prices go stale if you leave the tab open"): the
  // mount-only refresh above meant a portfolio left open all day kept
  // showing whatever prices happened to be current at the moment it
  // loaded. Re-runs the same refreshLivePrices() quietly on window focus,
  // tab visibility, and a gentle 60s interval — see useBackgroundRefresh's
  // doc comment. Disabled entirely when there are no holdings to refresh.
  useBackgroundRefresh(refreshLivePrices, { intervalMs: 60_000, enabled: holdings.length > 0 });

  const totals = computePortfolioTotals(holdings, cash);
  const hasHoldings = holdings.length > 0;

  const fxMultiplier = displayCurrency === "USD" ? 1 : USD_TO_ILS_RATE;
  const formatDisplay = displayCurrency === "USD" ? money : moneyIls;
  const totalValueDisplay = formatDisplay(totals.totalPortfolioValueUsd * fxMultiplier);
  const totalGainDisplay = formatDisplay(Math.abs(totals.totalGainLoss) * fxMultiplier);
  const gainUp = totals.totalGainLoss >= 0;

  return (
    <div className="space-y-6">
      {/* Header — total portfolio value, gain/loss trend, USD/ILS toggle */}
      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Portfolio Overview</h1>
            <p className="text-sm text-muted-foreground">Total Gain/Loss</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {totalValueDisplay}
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 font-mono text-sm font-semibold",
                gainUp ? "text-success" : "text-destructive"
              )}
            >
              {gainUp ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {totalGainDisplay} ({formatPercent(totals.totalGainLossPercent)})
            </span>
            <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
          </div>
        </div>
      </div>

      {/* Secondary metrics row + Add Stock button (button sits beside the row, not inside a card) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 text-sm text-muted-foreground">Total Dividends</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dividends Paid</span>
                <span className="font-mono text-foreground">{money(totals.totalDividendsPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dividends Yield</span>
                <span className="font-mono text-foreground">
                  {totals.blendedDividendYieldPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 text-sm text-muted-foreground">Cash Balance</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cash (USD)</span>
                <span className="font-mono text-foreground">{money(cash.usd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cash (ILS)</span>
                <span className="font-mono text-foreground">{moneyIls(cash.ils)}</span>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 text-sm text-muted-foreground">Daily Gain/Loss</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gain/Loss</span>
                <span
                  className={cn(
                    "font-mono",
                    totals.dailyGainLoss >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {money(totals.dailyGainLoss)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gain/Loss %</span>
                <span
                  className={cn(
                    "font-mono",
                    totals.dailyGainLossPercent >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {formatPercent(totals.dailyGainLossPercent)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 lg:self-start"
        >
          <Plus className="h-4 w-4" /> Add Stock
        </button>
      </div>

      {hasHoldings ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <PortfolioValueChart startValue={totals.totalCostBasis} endValue={totals.totalPositionValue} />
            <AssetAllocationChart holdings={holdings} totalCashUsd={totals.totalCashUsd} />
          </div>
          <HoldingsTable holdings={holdings} onRemove={removeHolding} />
        </>
      ) : (
        <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl !border-dashed py-24 text-center">
          <Briefcase className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Holdings are empty</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Start building your portfolio by adding your first stock.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add your first stock
          </button>
        </div>
      )}

      <AddStockModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
