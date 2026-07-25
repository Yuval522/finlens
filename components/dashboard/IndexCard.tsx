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
        "flex items-center gap-3 rounded-lg border border-border bg-card p-4",
        className
      )}
    >
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
