"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PortfolioHolding } from "@/lib/portfolio/store";
import { sellHolding } from "@/lib/portfolio/store";
import { Portal } from "@/components/shared/Portal";

interface SellHoldingModalProps {
  open: boolean;
  holding: PortfolioHolding | null;
  onClose: () => void;
}

function money(v: number, currency: string): string {
  const symbol = currency === "ILA" ? "₪" : "$";
  return `${symbol}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Smart Sell Cash Integration feature (request: "prompt the user to
 * specify the selling price (defaulting to current market price),
 * calculate the total proceeds, and automatically add that cash amount to
 * the portfolio's Cash Balance"). Replaces the old bare delete button —
 * every removal now goes through this confirmation flow so proceeds are
 * never silently lost. Supports selling fewer shares than the full
 * position (a partial sell just reduces the holding; see sellHolding's doc
 * comment in the store for the full/partial distinction) — shares-to-sell
 * defaults to the full position since "removing a position" was the
 * primary framing in the request, but is editable for a partial trim.
 * Same modal shell as AddStockModal/EditCashModal for consistency.
 */
export function SellHoldingModal({ open, holding, onClose }: SellHoldingModalProps) {
  const [sharesToSell, setSharesToSell] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  useEffect(() => {
    if (open && holding) {
      setSharesToSell(String(holding.shares));
      setSellPrice(String(holding.currentPrice));
    }
  }, [open, holding]);

  if (!open || !holding) return null;

  const sharesNum = Number(sharesToSell);
  const priceNum = Number(sellPrice);
  const clampedShares = Math.min(Math.max(sharesNum || 0, 0), holding.shares);
  const isPartial = clampedShares > 0 && clampedShares < holding.shares;
  const proceeds = clampedShares * (priceNum || 0);
  const canSubmit = sharesNum > 0 && sharesNum <= holding.shares && Number.isFinite(priceNum) && priceNum > 0;

  function handleSubmit() {
    if (!canSubmit || !holding) return;
    sellHolding(holding.symbol, sharesNum, priceNum);
    onClose();
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sell ${holding.symbol}`}
        className="glass-card fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Sell <span className="font-mono">{holding.symbol}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {holding.name} · You own {holding.shares} share{holding.shares === 1 ? "" : "s"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Shares to Sell</label>
              <input
                type="number"
                min="0"
                max={holding.shares}
                step="any"
                value={sharesToSell}
                onChange={(e) => setSharesToSell(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Sell Price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card/60 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Proceeds</span>
              <span className="font-mono text-sm font-semibold text-success">
                {money(proceeds, holding.currency)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isPartial
                ? `Sells ${clampedShares} of ${holding.shares} shares; the rest stays in your portfolio.`
                : "Sells your entire position in this stock."}{" "}
              Proceeds are added to your {holding.currency === "ILA" ? "ILS" : "USD"} Cash Balance.
            </p>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm Sale
          </button>
        </div>
      </div>
    </Portal>
  );
}
