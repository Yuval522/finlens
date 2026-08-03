"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PortfolioHolding } from "@/lib/portfolio/store";
import { updateHolding } from "@/lib/portfolio/store";

interface EditHoldingModalProps {
  open: boolean;
  holding: PortfolioHolding | null;
  onClose: () => void;
}

/**
 * Edit Holdings feature (request: "allow users to modify existing
 * positions, shares, and purchase prices"). Deliberately separate from the
 * Buy/Sell flow (AddStockModal / SellHoldingModal) — this is a direct
 * correction to the recorded position (e.g. fixing a typo'd share count or
 * cost basis) and does NOT touch Cash Balance, matching updateHolding's
 * no-cash-impact contract in the store. Same modal shell as
 * AddStockModal/EditCashModal (backdrop + centered glass-card dialog,
 * max-h-[85vh] + overflow-y-auto for short/mobile viewports) for
 * consistency with the rest of the portfolio UI.
 */
export function EditHoldingModal({ open, holding, onClose }: EditHoldingModalProps) {
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // Re-seed from the live holding every time the modal (re)opens for a
  // (possibly different) symbol, not just on first mount.
  useEffect(() => {
    if (open && holding) {
      setShares(String(holding.shares));
      setPurchasePrice(String(holding.purchasePrice));
    }
  }, [open, holding]);

  if (!open || !holding) return null;

  const sharesNum = Number(shares);
  const priceNum = Number(purchasePrice);
  const canSubmit = Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(priceNum) && priceNum > 0;

  function handleSubmit() {
    if (!canSubmit || !holding) return;
    updateHolding(holding.symbol, { shares: sharesNum, purchasePrice: priceNum });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${holding.symbol} position`}
        className="glass-card fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Edit <span className="font-mono">{holding.symbol}</span>
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
          <p className="text-xs text-muted-foreground">{holding.name}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Number of Shares</label>
              <input
                type="number"
                min="0"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Purchase Price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            This only corrects your recorded position — it does not affect your Cash Balance.
          </p>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
}
