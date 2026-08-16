import { TrendingUp } from "lucide-react";
import { IndexCard } from "@/components/dashboard/IndexCard";

// Live US "most actives" screener (6) blended with a curated TASE list (6)
// — see lib/finance/symbols.ts and lib/finance/yahoo.ts#getMostActive.
const MOST_ACTIVE_SLOTS = 12;

/** Loading-state skeleton — shown as the Suspense fallback for MostActiveSection. */
export function MostActiveGrid() {
  return (
    <section>
      {/* Matches QuoteCardGrid's heading/icon-badge treatment exactly so nothing reflows when live data replaces this skeleton. */}
      <div className="mb-4 flex items-center justify-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <TrendingUp className="h-4 w-4" />
        </span>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Most Active</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {Array.from({ length: MOST_ACTIVE_SLOTS }).map((_, i) => (
          <IndexCard key={i} />
        ))}
      </div>
    </section>
  );
}
