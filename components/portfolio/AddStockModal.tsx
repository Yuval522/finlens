"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import type { SearchResultItem } from "@/lib/finance/types";
import { toDisplayUnit } from "@/lib/format/currency";
import { addHolding } from "@/lib/portfolio/store";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";

interface AddStockModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Live ticker-search combobox, reusing the same /api/search endpoint (and
 * debounced-fetch pattern) as SymbolSearchInput/ComparePanel's
 * AddTickerSearch elsewhere in FinLens — rebuilt here rather than imported
 * because both of those drive different selection behavior (route
 * navigation / append-to-comparison), while this one needs to hold the
 * selected result in local state and show a confirmation card, per the
 * verified reference workflow: typing shows a dropdown of matches across
 * exchanges, and you must click a specific result to confirm — nothing
 * happens until you do.
 */
function TickerCombobox({
  selected,
  onSelect,
  onClear,
}: {
  selected: SearchResultItem | null;
  onSelect: (result: SearchResultItem) => void;
  onClear: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (selected) {
    // Mini confirmation card — matches the verified reference behavior of
    // showing a checkmark + confirmation once a specific result is chosen.
    return (
      <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 px-3 py-2.5">
        <CompanyLogo symbol={selected.symbol} name={selected.name} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            <span className="font-mono">{selected.symbol}</span> · {selected.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {selected.exchange} · {selected.currency}
          </p>
        </div>
        <Check className="h-4 w-4 shrink-0 text-success" />
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Change ticker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by symbol or company name..."
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && query.trim() && (
        <div className="glass-panel absolute left-0 right-0 top-11 z-10 max-h-56 overflow-y-auto rounded-md border border-border shadow-xl">
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">No matches for &ldquo;{query.trim()}&rdquo;</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              type="button"
              // mousedown fires before the input's blur/click-outside handler closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-mono font-semibold text-foreground">{r.symbol}</span>{" "}
                  <span className="text-muted-foreground">{r.name}</span>
                </p>
              </div>
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {r.exchange}
              </span>
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                {r.currency}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "+ Add Stock" workflow. Verified-against-reference field set is
 * deliberately just three real inputs — Stock Symbol (combobox), Number of
 * Shares, Purchase Price — no date field, since the reference implementation
 * itself doesn't have one either.
 */
export function AddStockModal({ open, onClose }: AddStockModalProps) {
  const [selected, setSelected] = useState<SearchResultItem | null>(null);
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setShares("");
      setPurchasePrice("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const sharesNum = Number(shares);
  const priceNum = Number(purchasePrice);
  const canSubmit = Boolean(selected) && sharesNum > 0 && priceNum > 0 && !submitting;

  async function handleSubmit() {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    // Best-effort live quote for the initial current price/today's move —
    // falls back to the purchase price itself (0% move, brand-new position)
    // if the live quote can't be reached, so the position never renders
    // broken/blank even offline.
    let currentPrice = priceNum;
    let changePercent = 0;
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(selected.symbol)}`);
      if (res.ok) {
        const data = await res.json();
        const quote = (data.quotes ?? [])[0];
        if (quote?.price != null) {
          currentPrice = toDisplayUnit(quote.price, quote.currency);
          changePercent = quote.changePercent ?? 0;
        }
      }
    } catch {
      // Keep the fallback above.
    }

    addHolding({
      symbol: selected.symbol,
      name: selected.name,
      currency: selected.currency,
      shares: sharesNum,
      purchasePrice: priceNum,
      currentPrice,
      changePercent,
      dividendYieldPercent: 0,
      dividendsPaid: 0,
    });
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add stock to portfolio"
        className="glass-card fixed left-1/2 top-1/2 z-[60] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Add Stock</h2>
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
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Stock Symbol</label>
            <TickerCombobox selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} />
          </div>

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

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to Portfolio
          </button>
          {!selected && (
            <p className="text-center text-xs text-muted-foreground">
              Select a ticker from the search results above to continue.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
