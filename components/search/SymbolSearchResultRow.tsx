import type { SearchResultItem } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

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
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        // mousedown (not click) so this fires before the input's blur handler closes the list
        e.preventDefault();
        onSelect(result);
      }}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/60"
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
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
          {result.currency}
        </span>
      </div>
    </button>
  );
}
