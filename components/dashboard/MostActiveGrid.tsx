import { IndexCard } from "@/components/dashboard/IndexCard";

// Live US "most actives" screener (6) blended with a curated TASE list (6)
// — see lib/finance/symbols.ts and lib/finance/yahoo.ts#getMostActive.
const MOST_ACTIVE_SLOTS = 12;

/** Loading-state skeleton — shown as the Suspense fallback for MostActiveSection. */
export function MostActiveGrid() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Most Active
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: MOST_ACTIVE_SLOTS }).map((_, i) => (
          <IndexCard key={i} />
        ))}
      </div>
    </section>
  );
}
