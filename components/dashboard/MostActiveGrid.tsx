import { IndexCard } from "@/components/dashboard/IndexCard";

const MOST_ACTIVE_SLOTS = 9;

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
