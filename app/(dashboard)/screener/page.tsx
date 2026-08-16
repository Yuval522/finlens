"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ScanSearch, SlidersHorizontal, X } from "lucide-react";
import { Led } from "@/components/shared/Led";
import { SCREENER_SECTORS, SCREENER_UNIVERSE, type ScreenerStock } from "@/lib/finance/screener-data";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { cn } from "@/lib/utils";

type SortKey = "symbol" | "price" | "changePercent" | "marketCapB" | "peRatio" | "dividendYieldPercent";

// QA fix (Market Cap column data-bleed bug): this used to include a
// standalone {key:"symbol", label:"Ticker"} entry, giving the header row 7
// <th> cells (hardcoded "Name" + 6 here) while every body <tr> only ever
// rendered 6 <td> cells (the ticker is shown *inside* the combined
// logo/name/symbol cell, not as its own column) — so every data column
// rendered one slot left of its header. That's why P/E values like "40.3x"
// visually landed under the "Market Cap" header: Market Cap's header sat
// over the P/E column's data, and P/E's header sat over Div Yield's data.
// Removing the redundant Ticker column brings both counts back to 6/6; the
// "Name" header below is now the sort trigger for symbol instead.
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "changePercent", label: "Change %" },
  { key: "marketCapB", label: "Market Cap" },
  { key: "peRatio", label: "P/E" },
  { key: "dividendYieldPercent", label: "Div Yield" },
];

/**
 * Advanced filtering terminal — sidebar filter panel + live-updating sortable
 * results table, matching the reference terminal's Screener layout. Filters
 * entirely client-side against the illustrative SCREENER_UNIVERSE (see that
 * file's doc comment — no live screener API is wired up in this build), so
 * every control below reacts instantly with no network round-trip.
 */
export default function ScreenerPage() {
  const router = useRouter();
  const [sector, setSector] = useState<string>("All");
  const [marketCapMin, setMarketCapMin] = useState("");
  const [marketCapMax, setMarketCapMax] = useState("");
  const [peMax, setPeMax] = useState("");
  const [divYieldMin, setDivYieldMin] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCapB");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const capMin = marketCapMin === "" ? null : Number(marketCapMin);
    const capMax = marketCapMax === "" ? null : Number(marketCapMax);
    const peCap = peMax === "" ? null : Number(peMax);
    const yieldMin = divYieldMin === "" ? null : Number(divYieldMin);

    return SCREENER_UNIVERSE.filter((s) => {
      if (sector !== "All" && s.sector !== sector) return false;
      if (capMin != null && s.marketCapB < capMin) return false;
      if (capMax != null && s.marketCapB > capMax) return false;
      if (peCap != null && (s.peRatio == null || s.peRatio > peCap)) return false;
      if (yieldMin != null && s.dividendYieldPercent < yieldMin) return false;
      return true;
    });
  }, [sector, marketCapMin, marketCapMax, peMax, divYieldMin]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // P/E can be null (unprofitable companies) — always sort those last
      // regardless of direction, rather than letting them collapse to 0.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function resetFilters() {
    setSector("All");
    setMarketCapMin("");
    setMarketCapMax("");
    setPeMax("");
    setDivYieldMin("");
  }

  const hasActiveFilters = sector !== "All" || marketCapMin || marketCapMax || peMax || divYieldMin;

  return (
    <div className="space-y-6">
      {/* QA fix: reference header has no icon badge above the title, matching
          the same no-icon treatment already applied to Strategy Builder. */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-xl font-bold text-foreground">Stock Screener</h1>
        <p className="text-xs text-muted-foreground">
          {sorted.length} of {SCREENER_UNIVERSE.length} stocks match your filters
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        {/* Filter sidebar */}
        <aside className="glass-card h-fit space-y-5 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="All">All Sectors</option>
              {SCREENER_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Market Cap ($B)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="Min"
                value={marketCapMin}
                onChange={(e) => setMarketCapMin(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
              <input
                type="number"
                min={0}
                placeholder="Max"
                value={marketCapMax}
                onChange={(e) => setMarketCapMax(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Max P/E Ratio</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 30"
              value={peMax}
              onChange={(e) => setPeMax(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Min Dividend Yield (%)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              placeholder="e.g. 2"
              value={divYieldMin}
              onChange={(e) => setDivYieldMin(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </aside>

        {/* Results table */}
        <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ScanSearch className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No stocks match these filters.</p>
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              {/* QA fix: header row is uppercase/tracked-wide in the
                  reference (NAME / PRICE / CHANGE % / MARKET CAP / P/E /
                  DIV YIELD), matching the same treatment already applied to
                  the Strategy Builder results table. */}
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("symbol")}
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        Name
                        {sortKey === "symbol" ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronDown className="h-3 w-3 opacity-0" />
                        )}
                      </button>
                    </th>
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="px-2 py-2 text-right font-medium">
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className="inline-flex flex-row-reverse items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronDown className="h-3 w-3 opacity-0" />
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <ScreenerRow key={s.symbol} stock={s} onClick={() => router.push(`/analysis/${s.symbol}`)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScreenerRow({ stock, onClick }: { stock: ScreenerStock; onClick: () => void }) {
  const up = stock.changePercent >= 0;
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-accent/60"
    >
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <CompanyLogo symbol={stock.symbol} name={stock.name} size={22} />
          <div className="min-w-0">
            <div className="font-mono font-semibold text-foreground">{stock.symbol}</div>
            <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">{stock.name}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-foreground">${stock.price.toFixed(2)}</td>
      <td className="px-2 py-2.5 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono font-medium",
            up ? "text-success" : "text-destructive"
          )}
        >
          <Led up={up} />
          {Math.abs(stock.changePercent).toFixed(2)}%
        </span>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-foreground">
        {stock.marketCapB >= 1000 ? `$${(stock.marketCapB / 1000).toFixed(2)}T` : `$${stock.marketCapB.toFixed(0)}B`}
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
        {stock.peRatio == null ? "—" : `${stock.peRatio.toFixed(1)}x`}
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
        {stock.dividendYieldPercent === 0 ? "—" : `${stock.dividendYieldPercent.toFixed(2)}%`}
      </td>
    </tr>
  );
}
