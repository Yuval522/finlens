import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { getMarketSummary } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

const SLOTS = 5;
// QA hotfix (Phase 4): auto-fit/minmax instead of a fixed 5-column track —
// guarantees enough width per card for longer names ("NASDAQ Composite")
// before truncating, at any viewport.
const COLUMNS = "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]";

/** Async Server Component — fetched inside a <Suspense> boundary on the home page. */
export async function MarketSummarySection() {
  try {
    const quotes = await getMarketSummary();
    return (
      <QuoteCardGrid
        title="Market Summary"
        quotes={quotes}
        slots={SLOTS}
        columnsClassName={COLUMNS}
      />
    );
  } catch (err) {
    const message =
      err instanceof MarketDataError
        ? err.message
        : "Market data is temporarily unavailable.";
    return (
      <QuoteCardGrid
        title="Market Summary"
        quotes={[]}
        slots={SLOTS}
        error={message}
        columnsClassName={COLUMNS}
      />
    );
  }
}
