"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { formatPercent } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { computeHolding, type HoldingComputed } from "@/lib/portfolio/derive";
import type { PortfolioHolding } from "@/lib/portfolio/store";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
  onRemove: (symbol: string) => void;
}

type SortKey =
  | "symbol"
  | "name"
  | "shares"
  | "purchasePrice"
  | "currentPrice"
  | "positionValue"
  | "gainLoss"
  | "dividendsPaid"
  | "dividendYieldPercent";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "name", label: "Name" },
  { key: "shares", label: "Shares", align: "right" },
  { key: "purchasePrice", label: "Purchase Price", align: "right" },
  { key: "currentPrice", label: "Current Price", align: "right" },
  { key: "positionValue", label: "Position Value", align: "right" },
  { key: "gainLoss", label: "Gain/Loss", align: "right" },
  { key: "dividendsPaid", label: "Dividend Paid", align: "right" },
  { key: "dividendYieldPercent", label: "Dividend Yield", align: "right" },
];

function money(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Sortable holdings table — exact column order verified against the
 * reference terminal: Symbol (with company icon), Name, Shares, Purchase
 * Price, Current Price, Position Value, Gain/Loss (colored $ + % combined),
 * Dividend Paid, Dividend Yield, Actions (delete). Clicking a header sorts
 * by that column, toggling ascending/descending on repeat clicks — matches
 * the confirmed-sortable "Gain/Loss" header behavior from the reference.
 */
export function HoldingsTable({ holdings, onRemove }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("positionValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => holdings.map(computeHolding), [holdings]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey as keyof HoldingComputed];
      const bv = b[sortKey as keyof HoldingComputed];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = Number(av) - Number(bv);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (holdings.length === 0) return null;

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Holdings</h3>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn("px-2 py-2 font-medium", col.align === "right" && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      col.align === "right" && "flex-row-reverse"
                    )}
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
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const gainUp = h.gainLoss >= 0;
              return (
                <tr key={h.symbol} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <CompanyLogo symbol={h.symbol} name={h.name} size={22} />
                      <span className="font-mono font-semibold text-foreground">{h.symbol}</span>
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-2.5 text-muted-foreground">{h.name}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-foreground">{h.shares}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                    {money(h.purchasePrice)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-foreground">{money(h.currentPrice)}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-semibold text-foreground">
                    {money(h.positionValue)}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-mono font-medium",
                        gainUp ? "text-success" : "text-destructive"
                      )}
                    >
                      {gainUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {money(Math.abs(h.gainLoss))} ({formatPercent(h.gainLossPercent)})
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                    {money(h.dividendsPaid)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                    {h.dividendYieldPercent.toFixed(2)}%
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(h.symbol)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title={`Remove ${h.symbol}`}
                      aria-label={`Remove ${h.symbol} from portfolio`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
