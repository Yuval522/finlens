"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PortfolioCash } from "@/lib/portfolio/store";
import { updateCash } from "@/lib/portfolio/store";
import { Portal } from "@/components/shared/Portal";

interface EditCashModalProps {
  open: boolean;
  cash: PortfolioCash;
  onClose: () => void;
}

/**
 * QA feature (live report: "Cash Balance" only ever displayed the two
 * figures — no way to update them short of clearing localStorage). Same
 * modal shell/pattern as AddStockModal (backdrop + centered glass-card
 * dialog), reused here for consistency rather than inventing a second
 * modal style for one more portfolio mutation. Two plain number inputs
 * (USD / ILS) rather than a combobox — there's nothing to search for here,
 * just two currency amounts.
 */
export function EditCashModal({ open, cash, onClose }: EditCashModalProps) {
  const [usd, setUsd] = useState("");
  const [ils, setIls] = useState("");

  // Re-seed the inputs from the live cash balance every time the modal is
  // (re)opened — not just on first mount — so a second edit in the same
  // session starts from the current figures, not whatever was last typed.
  useEffect(() => {
    if (open) {
      setUsd(String(cash.usd));
      setIls(String(cash.ils));
    }
  }, [open, cash.usd, cash.ils]);

  if (!open) return null;

  const usdNum = Number(usd);
  const ilsNum = Number(ils);
  const canSubmit = Number.isFinite(usdNum) && usdNum >= 0 && Number.isFinite(ilsNum) && ilsNum >= 0;

  function handleSubmit() {
    if (!canSubmit) return;
    updateCash({ usd: usdNum, ils: ilsNum });
    onClose();
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit cash balance"
        // Mobile responsiveness fix: same max-h-[85vh]/overflow-y-auto
        // safeguard as AddStockModal — see that file's identical dialog
        // className for the full rationale (short viewport + on-screen
        // keyboard could otherwise clip content with no way to scroll to it).
        className="glass-card fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Edit Cash Balance</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cash (USD)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-border bg-card py-2 pl-6 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cash (ILS)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₪
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={ils}
                  onChange={(e) => setIls(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-border bg-card py-2 pl-6 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Cash Balance
          </button>
        </div>
      </div>
    </Portal>
  );
}
