import type { SearchResultItem } from "@/lib/finance/types";
import { currencySymbol } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { WatchlistButton } from "@/components/shared/WatchlistButton";

const TYPE_LABELS: Record<string, string> = {
  EQUITY: "Stock",
  ETF: "ETF",
  INDEX: "Index",
  CRYPTOCURRENCY: "Crypto",
  MUTUALFUND: "Fund",
  CURRENCY: "FX",
};

export function SymbolSearchResultRow({
  result,
  active,
  onSelect,
}: {
  result: SearchResultItem;
  active: boolean;
  onSelect: (result: SearchResultItem) => void;
}) {
  return (
    // A plain div rather than <button> — a nested WatchlistButton needs to
    // live inside this row without producing invalid button-in-button HTML.
    // Selection semantics are unchanged: SymbolSearchInput drives keyboard
    // nav itself (activeIndex + Enter), this row only needs the mousedown
    // handler for pointer selection.
    <div
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        // mousedown (not click) so this fires before the input's blur handler closes the list.
        // stopPropagation is defensive: without it, this same mousedown also
        // bubbles up to the document-level "click outside" listener that
        // closes the dropdown — harmless today since that listener already
        // no-ops for clicks inside the container, but stopping it here means
        // selection can never race a future outside-click handler.
        e.preventDefault();
        e.stopPropagation();
        onSelect(result);
      }}
      className={cn(
        // UI/UX audit fix: hover used to be hover:bg-accent/60 (a 60%-alpha
        // tint of an already-dark --accent token) sitting on top of the
        // then-semi-transparent dropdown panel — two layers of partial
        // opacity stacked made the highlight easy to miss. Now that the
        // panel itself is fully opaque (search-dropdown-panel, see parent),
        // hover gets a clearly visible, immediate solid-ish highlight
        // instead; kept distinct from the stronger `active` (keyboard-
        // selected) state so mouse-hover and keyboard-focus don't look
        // identical. py-2.5 -> py-3.5 widens row spacing per the same
        // audit's "increase padding for readability" request.
        "flex w-full cursor-pointer items-center gap-3 px-3 py-3.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-white/[0.08]"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">
          {result.symbol}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {result.name}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {TYPE_LABELS[result.type] ?? result.type}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {result.exchange}
        </span>
        <span
          className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary"
          title={result.currency}
        >
          {currencySymbol(result.currency)}
        </span>
        <WatchlistButton symbol={result.symbol} size={14} className="p-1" />
      </div>
    </div>
  );
}
