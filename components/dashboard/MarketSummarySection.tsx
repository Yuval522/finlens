import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { getMarketSummary } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

const SLOTS = 5;
const COLUMNS = "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

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
