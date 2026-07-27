import { Crown } from "lucide-react";
import { IndexCard } from "@/components/dashboard/IndexCard";
import { BIG_SEVEN_SYMBOLS } from "@/lib/finance/symbols";

/** Loading-state skeleton — shown as the Suspense fallback for BigSevenSection. */
export function BigSevenGrid() {
  return (
    <section>
      {/* Matches QuoteCardGrid's heading/icon-badge treatment exactly so nothing reflows when live data replaces this skeleton. */}
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
          <Crown className="h-4 w-4" />
        </span>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Big 7</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {BIG_SEVEN_SYMBOLS.map((symbol) => (
          <IndexCard key={symbol} />
        ))}
      </div>
    </section>
  );
}
