"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Led } from "@/components/shared/Led";
import { formatChange, formatPercent } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { computeHolding, type HoldingComputed } from "@/lib/portfolio/derive";
import type { PortfolioHolding } from "@/lib/portfolio/store";
import type { LiveQuoteTick } from "@/lib/finance/useLiveQuotes";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";

interface HoldingsTableProps {
  holdings: PortfolioHolding[];
  /** Opens EditHoldingModal for this symbol (shares/purchase price correction — no cash impact). */
  onEdit: (symbol: string) => void;
  /** Opens SellHoldingModal for this symbol (Smart Sell flow — prompts sell price, credits Cash Balance). Replaces the old direct-delete behavior: removing a holding is now always a sell transaction, matching the "when selling/removing a position" feature request. */
  onSell: (symbol: string) => void;
  /** Live Trading Feed ticks keyed by symbol (see useLiveQuotes) — flashes the Current Price cell green/red on an actual poll-to-poll move. Optional so the table still renders fine without a live feed wired up. */
  ticks?: Map<string, LiveQuoteTick>;
}

type SortKey =
  | "symbol"
  | "name"
  | "shares"
  | "purchasePrice"
  | "currentPrice"
  | "positionValue"
  | "gainLoss"
  | "gainLossPercent"
  | "dividendsPaid"
  | "dividendYieldPercent";

// QA fix: "Gain/Loss" used to be one COLUMNS entry rendering a single <th>
// (and one combined "$X (+Y%)" <td>) — now split into two data columns
// (dollar amount, percentage), but the reference design still shows ONE
// "Gain/Loss" header label spanning both of them, not two separate column
// labels. COLUMNS is split at that point (BEFORE/AFTER) so the render can
// inject one hand-built colSpan=2 <th> for the group in between, instead of
// every column going through the same generic single-column header cell.
const COLUMNS_BEFORE_GAIN: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "name", label: "Name" },
  { key: "shares", label: "Shares", align: "right" },
  { key: "purchasePrice", label: "Purchase Price", align: "right" },
  { key: "currentPrice", label: "Current Price", align: "right" },
  { key: "positionValue", label: "Position Value", align: "right" },
];
const COLUMNS_AFTER_GAIN: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "dividendsPaid", label: "Dividend Paid", align: "right" },
  { key: "dividendYieldPercent", label: "Dividend Yield", align: "right" },
];

function money(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Mobile responsiveness fix (feature request: "ensure the holdings table,
 * cards, and action buttons scale cleanly ... on mobile viewports"). Below
 * `md`, the wide 9-column + Actions table is genuinely unusable on a phone
 * even with horizontal scroll (tiny tap targets, no context per swipe), so
 * it's replaced entirely by a stacked one-holding-per-card layout showing
 * the same data in a vertical key/value list, with full-width 44px-tall
 * Edit/Sell buttons. `md:hidden` on this / `hidden md:block` on the table
 * below keeps exactly one of the two mounted at a time per breakpoint.
 */
function HoldingCard({
  h,
  tick,
  onEdit,
  onSell,
  onOpen,
}: {
  h: HoldingComputed;
  tick?: LiveQuoteTick;
  onEdit: (symbol: string) => void;
  onSell: (symbol: string) => void;
  onOpen: (symbol: string) => void;
}) {
  const gainUp = h.gainLoss >= 0;
  const priceFlashClass =
    tick?.direction === "up" ? "price-flash-up" : tick?.direction === "down" ? "price-flash-down" : undefined;

  return (
    <div className="rounded-lg border border-slate-800/60 bg-card/40 p-3">
      <button type="button" onClick={() => onOpen(h.symbol)} className="flex w-full items-center gap-2.5 text-left">
        <CompanyLogo symbol={h.symbol} name={h.name} size={28} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold text-foreground">{h.symbol}</p>
          <p className="truncate text-xs text-muted-foreground">{h.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold text-foreground">{money(h.positionValue)}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-xs font-medium",
              gainUp ? "text-success" : "text-destructive"
            )}
          >
            <Led up={gainUp} />
            {formatPercent(h.gainLossPercent)}
          </span>
        </div>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-y-1.5 border-t border-slate-800/60 pt-2.5 text-xs">
        <span className="text-muted-foreground">Shares</span>
        <span className="text-right font-mono text-foreground">{h.shares}</span>
        <span className="text-muted-foreground">Purchase Price</span>
        <span className="text-right font-mono text-muted-foreground">{money(h.purchasePrice)}</span>
        <span className="text-muted-foreground">Current Price</span>
        <span className={cn("text-right font-mono text-foreground", priceFlashClass)}>{money(h.currentPrice)}</span>
        <span className="text-muted-foreground">Dividend Paid</span>
        <span className="text-right font-mono text-muted-foreground">{money(h.dividendsPaid)}</span>
        <span className="text-muted-foreground">Dividend Yield</span>
        <span className="text-right font-mono text-muted-foreground">{h.dividendYieldPercent.toFixed(2)}%</span>
      </div>

      <div className="mt-3 flex gap-2 border-t border-slate-800/60 pt-2.5">
        <button
          type="button"
          onClick={() => onEdit(h.symbol)}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onSell(h.symbol)}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-destructive/30 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Sell
        </button>
      </div>
    </div>
  );
}

/**
 * Sortable holdings table — exact column order verified against the
 * reference terminal: Symbol (with company icon), Name, Shares, Purchase
 * Price, Current Price, Position Value, Gain/Loss (colored $ + % combined),
 * Dividend Paid, Dividend Yield, Actions (edit + sell). Clicking a header
 * sorts by that column, toggling ascending/descending on repeat clicks —
 * matches the confirmed-sortable "Gain/Loss" header behavior from the
 * reference. Below `md`, a stacked card layout (HoldingCard) replaces the
 * table entirely — see that component's doc comment.
 */
export function HoldingsTable({ holdings, onEdit, onSell, ticks }: HoldingsTableProps) {
  const router = useRouter();
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

  function openTicker(symbol: string) {
    router.push(`/analysis/${encodeURIComponent(symbol)}`);
  }

  // Shared sortable-header-cell renderer — factored out so the Gain/Loss
  // group split doesn't require duplicating this button/chevron markup for
  // both COLUMNS_BEFORE_GAIN and COLUMNS_AFTER_GAIN.
  function renderHeaderCell(col: { key: SortKey; label: string; align?: "right" }) {
    return (
      <th key={col.key} className={cn("px-2 py-2 font-medium", col.align === "right" && "text-right")}>
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
    );
  }

  if (holdings.length === 0) return null;

  return (
    <div className="glass-card min-w-0 rounded-xl p-3 sm:p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Holdings</h3>

      {/* Mobile: stacked cards (see HoldingCard doc comment). */}
      <div className="grid grid-cols-1 gap-2.5 md:hidden">
        {sorted.map((h) => (
          <HoldingCard key={h.symbol} h={h} tick={ticks?.get(h.symbol)} onEdit={onEdit} onSell={onSell} onOpen={openTicker} />
        ))}
      </div>

      {/* Desktop/tablet: full sortable table. */}
      <div className="-mx-1 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-700/80 text-left text-muted-foreground">
              {COLUMNS_BEFORE_GAIN.map(renderHeaderCell)}

              {/* QA fix: grouped "Gain/Loss" header spanning the two new
                  sub-columns (dollar amount, percentage) below it — colored
                  the brand orange per the reference, with an orange dotted
                  bottom border in place of the row's default solid gray
                  divider for just this cell (border-b-2 on the <th> itself
                  wins the border-collapse conflict against the thinner
                  tr-level border, same technique as the Strategy Builder
                  table's "Why it's close" divider). colSpan=2 makes this
                  cell exactly as wide as the two <td>s beneath it, so the
                  divider visually "splits" across both. */}
              <th
                colSpan={2}
                className="border-b-2 border-dotted border-primary px-2 py-2 text-right font-medium text-primary"
              >
                <button
                  type="button"
                  onClick={() => handleSort("gainLoss")}
                  className="inline-flex flex-row-reverse items-center gap-1 transition-colors hover:opacity-80"
                >
                  Gain/Loss
                  {sortKey === "gainLoss" || sortKey === "gainLossPercent" ? (
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

              {COLUMNS_AFTER_GAIN.map(renderHeaderCell)}
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const gainUp = h.gainLoss >= 0;
              const tick = ticks?.get(h.symbol);
              const priceFlashClass =
                tick?.direction === "up"
                  ? "price-flash-up"
                  : tick?.direction === "down"
                    ? "price-flash-down"
                    : undefined;
              return (
                <tr
                  key={h.symbol}
                  onClick={() => openTicker(h.symbol)}
                  className="cursor-pointer border-b border-slate-800/60 transition-colors last:border-0 hover:bg-accent/60"
                >
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
                  <td className="px-2 py-2.5 text-right font-mono text-foreground">
                    <span key={tick?.flashKey ?? 0} className={cn("inline-block px-1", priceFlashClass)}>
                      {money(h.currentPrice)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono font-semibold text-foreground">
                    {money(h.positionValue)}
                  </td>
                  {/* QA fix: split into two columns — dollar amount (with
                      the direction LED, sign-prefixed via formatChange) and
                      percentage, both carrying the same green/red color so
                      the pair still reads as one unit despite being two
                      cells, matching the reference. */}
                  <td className="px-2 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-mono font-medium",
                        gainUp ? "text-success" : "text-destructive"
                      )}
                    >
                      <Led up={gainUp} />
                      {formatChange(h.gainLoss, "USD")}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2.5 text-right font-mono font-medium",
                      gainUp ? "text-success" : "text-destructive"
                    )}
                  >
                    ({formatPercent(h.gainLossPercent)})
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                    {money(h.dividendsPaid)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                    {h.dividendYieldPercent.toFixed(2)}%
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {/* Mobile responsiveness fix: 44px (h-11 w-11) touch
                        targets with a negative margin trick to avoid
                        bloating row height, matching the convention used
                        throughout this codebase (Sidebar/Topbar's own
                        "Mobile UX audit fix" comments). Both buttons sit
                        inside an otherwise-fully-clickable row (onClick
                        navigates to the ticker), so stopPropagation keeps
                        editing/selling from also triggering navigation. */}
                    <div className="-my-2.5 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(h.symbol);
                        }}
                        className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={`Edit ${h.symbol}`}
                        aria-label={`Edit ${h.symbol} position`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSell(h.symbol);
                        }}
                        className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title={`Sell ${h.symbol}`}
                        aria-label={`Sell ${h.symbol} from portfolio`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
