import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton/placeholder card for a single index or stock row.
 * Mirrors the eventual data layout (logo, name, symbol, price, change)
 * so real data can be swapped in later without changing the markup.
 */
export function IndexCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        // Matches MarketQuoteCard's density-pass sizing (p-5 padding, 40px
        // avatar) so the skeleton-to-loaded swap doesn't reflow/jump. Same
        // .hig-card treatment as the loaded card (Apple-HIG concept
        // redesign) so the skeleton-to-loaded swap doesn't visibly pop
        // from a flat card to a glass one either.
        "hig-card relative flex items-center gap-3 p-5",
        className
      )}
    >
      <Skeleton className="absolute right-3 top-3 h-6 w-6 rounded-full" />
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2 pr-7">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Mirrors MarketQuoteCard's pr-6/pt-0.5 badge-clearance fix so the
          skeleton-to-loaded swap doesn't reflow. */}
      <div className="flex flex-col items-end gap-2 pr-6 pt-0.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
