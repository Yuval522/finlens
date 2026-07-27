"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import type { FundamentalsBundle, SearchResultItem } from "@/lib/finance/types";
import { formatMarketCap } from "@/lib/format/currency";
import { compactAxis } from "@/lib/format/chart";

const MAX_TICKERS = 5;

interface ComparePanelProps {
  /** The ticker currently being viewed — pre-seeded into the comparison so
   * the panel isn't empty on first load. */
  initialSymbol: string;
}

interface TickerState {
  symbol: string;
  status: "loading" | "ready" | "error";
  bundle?: FundamentalsBundle;
  error?: string;
}

/** YoY growth between the last two entries of an ascending-by-year series. */
function trailingGrowthPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const prev = values[values.length - 2];
  const latest = values[values.length - 1];
  if (!prev) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

interface MetricRow {
  label: string;
  /** Extracts the comparable numeric value for a ticker, or null if unavailable. */
  value: (b: FundamentalsBundle) => number | null;
  format: (v: number, b: FundamentalsBundle) => string;
  /** Omit to disable best/worst highlighting for size-only metrics (market cap, revenue level). */
  higherIsBetter?: boolean;
}

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Market Cap",
    value: (b) => b.metrics.financials.marketCap,
    format: (v, b) => formatMarketCap(v, b.quote.currency),
  },
  {
    label: "Revenue (TTM)",
    value: (b) => b.income[b.income.length - 1]?.totalRevenue ?? null,
    format: (v, b) => `${compactAxis(v)} ${b.reportingCurrency}`,
  },
  {
    label: "Revenue Growth",
    value: (b) => trailingGrowthPct(b.income.map((y) => y.totalRevenue)),
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "Gross Margin",
    value: (b) => b.metrics.margins.grossMargin,
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "Operating Margin",
    value: (b) => b.metrics.margins.operatingMargin,
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "Net Margin",
    value: (b) => b.metrics.margins.netIncomeMargin,
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "EPS Growth",
    value: (b) => trailingGrowthPct(b.income.map((y) => y.eps)),
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "P/E",
    value: (b) => b.metrics.financials.peRatio,
    format: (v) => v.toFixed(1),
    higherIsBetter: false,
  },
  {
    label: "Fwd P/E",
    value: (b) => b.metrics.financials.forwardPE,
    format: (v) => v.toFixed(1),
    higherIsBetter: false,
  },
  {
    label: "Fwd PEG",
    value: (b) => b.metrics.financials.forwardPeg,
    format: (v) => v.toFixed(2),
    higherIsBetter: false,
  },
  {
    label: "P/CF",
    value: (b) => b.metrics.financials.priceToCashFlow,
    format: (v) => v.toFixed(1),
    higherIsBetter: false,
  },
  {
    label: "P/FCF",
    value: (b) => b.metrics.financials.priceToFreeCashFlow,
    format: (v) => v.toFixed(1),
    higherIsBetter: false,
  },
];

function AddTickerSearch({
  disabled,
  existingSymbols,
  onAdd,
}: {
  disabled: boolean;
  existingSymbols: string[];
  onAdd: (symbol: string) => void;
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
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults((data.results ?? []).filter((r: SearchResultItem) => !existingSymbols.includes(r.symbol)));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, existingSymbols]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(symbol: string) {
    onAdd(symbol);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  if (disabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Comparison is full ({MAX_TICKERS} of {MAX_TICKERS}) — remove a ticker to add another.
      </p>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Add a ticker to compare..."
        className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        // Same fix as SymbolSearchInput: stop the browser's own field-
        // history/autofill suggestion box from rendering on top of this
        // dropdown and swallowing clicks meant for it.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
      />
      {loading && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && query.trim() && (
        <div className="search-dropdown-panel absolute left-0 right-0 top-9 z-50 max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border shadow-xl">
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
          )}
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              onMouseDown={(e) => {
                // mousedown (not click) — consistent with the other two
                // search comboboxes, so selection always fires before any
                // blur/outside-click handler could close this dropdown out
                // from under the click.
                e.preventDefault();
                e.stopPropagation();
                select(r.symbol);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-xs transition-colors hover:bg-white/[0.08]"
            >
              <span className="font-mono font-medium text-foreground">{r.symbol}</span>
              <span className="truncate text-muted-foreground">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComparePanel({ initialSymbol }: ComparePanelProps) {
  const [tickers, setTickers] = useState<TickerState[]>([{ symbol: initialSymbol, status: "loading" }]);

  useEffect(() => {
    tickers.forEach((t) => {
      if (t.status !== "loading" || t.bundle) return;
      fetch(`/api/fundamentals/${encodeURIComponent(t.symbol)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to load");
          setTickers((cur) =>
            cur.map((c) => (c.symbol === t.symbol ? { ...c, status: "ready", bundle: data } : c))
          );
        })
        .catch((err) => {
          setTickers((cur) =>
            cur.map((c) => (c.symbol === t.symbol ? { ...c, status: "error", error: String(err.message ?? err) } : c))
          );
        });
    });
    // Only re-run when the set of symbols changes, not on every status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.map((t) => t.symbol).join(",")]);

  function addTicker(symbol: string) {
    setTickers((cur) => (cur.length >= MAX_TICKERS ? cur : [...cur, { symbol, status: "loading" }]));
  }

  function removeTicker(symbol: string) {
    setTickers((cur) => cur.filter((t) => t.symbol !== symbol));
  }

  const ready = tickers.filter((t): t is TickerState & { bundle: FundamentalsBundle } => t.status === "ready" && Boolean(t.bundle));

  return (
    <div className="glass-card min-w-0 space-y-4 rounded-xl p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Multi-Stock Comparison</h3>
          <p className="text-xs text-muted-foreground">Up to {MAX_TICKERS} tickers side-by-side</p>
        </div>
        <AddTickerSearch
          disabled={tickers.length >= MAX_TICKERS}
          existingSymbols={tickers.map((t) => t.symbol)}
          onAdd={addTicker}
        />
      </div>

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Metric</th>
              {tickers.map((t) => (
                <th key={t.symbol} className="px-2 py-2 text-right font-medium">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-mono text-foreground">{t.symbol}</span>
                    <button
                      type="button"
                      onClick={() => removeTicker(t.symbol)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title={`Remove ${t.symbol}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => {
              const values = tickers.map((t) => (t.bundle ? row.value(t.bundle) : null));
              const numeric = values.filter((v): v is number => v != null);
              const best =
                row.higherIsBetter != null && numeric.length > 1 ? Math.max(...numeric) : null;
              const worst =
                row.higherIsBetter != null && numeric.length > 1 ? Math.min(...numeric) : null;
              const hasSpread = best !== worst;

              return (
                <tr key={row.label} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-2 py-2.5 font-medium text-muted-foreground">{row.label}</td>
                  {tickers.map((t, idx) => {
                    if (t.status === "loading") {
                      return (
                        <td key={t.symbol} className="px-2 py-2.5 text-right text-muted-foreground">
                          <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                        </td>
                      );
                    }
                    if (t.status === "error" || !t.bundle) {
                      return (
                        <td key={t.symbol} className="px-2 py-2.5 text-right text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    const v = values[idx];
                    if (v == null) {
                      return (
                        <td key={t.symbol} className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    const rank =
                      row.higherIsBetter == null || !hasSpread
                        ? "neutral"
                        : v === best
                          ? row.higherIsBetter
                            ? "best"
                            : "worst"
                          : v === worst
                            ? row.higherIsBetter
                              ? "worst"
                              : "best"
                            : "mid";
                    return (
                      <td key={t.symbol} className="px-2 py-2.5 text-right">
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 font-mono ${
                            rank === "best"
                              ? "bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                              : rank === "worst"
                                ? "bg-rose-500/10 text-rose-400"
                                : "text-foreground"
                          }`}
                        >
                          {row.format(v, t.bundle)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tickers.length < MAX_TICKERS && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Plus className="h-3 w-3" /> Add up to {MAX_TICKERS - tickers.length} more ticker
          {MAX_TICKERS - tickers.length === 1 ? "" : "s"} using the search box above.
        </p>
      )}
    </div>
  );
}
