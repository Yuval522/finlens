import { Crown } from "lucide-react";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { LiveBigSevenGrid } from "@/components/dashboard/LiveBigSevenGrid";
import { getBigSeven } from "@/lib/finance/yahoo";
import { BIG_SEVEN_SYMBOLS } from "@/lib/finance/symbols";
import { MarketDataError } from "@/lib/finance/types";

// Retro-Digital redesign: single-accent orange badge (was violet).
const ICON_CLASS = "bg-primary/15 text-primary";
const COLUMNS = "grid-cols-[repeat(auto-fit,minmax(300px,1fr))]";

/**
 * Async Server Component — fetched inside a <Suspense> boundary on the home
 * page, same pattern as MarketSummarySection/MostActiveSection. Hands its
 * server-fetched quotes off to LiveBigSevenGrid (client) for the Live
 * Trading Feed polling/flash treatment rather than rendering QuoteCardGrid
 * directly, so the initial paint has real data with zero loading flash and
 * the cards start ticking live immediately after.
 */
export async function BigSevenSection() {
  try {
    const quotes = await getBigSeven();
    return <LiveBigSevenGrid symbols={BIG_SEVEN_SYMBOLS} initialQuotes={quotes} />;
  } catch (err) {
    const message =
      err instanceof MarketDataError
        ? err.message
        : "Market data is temporarily unavailable.";
    return (
      <QuoteCardGrid
        title="Big 7"
        quotes={[]}
        slots={BIG_SEVEN_SYMBOLS.length}
        error={message}
        columnsClassName={COLUMNS}
        icon={Crown}
        iconClassName={ICON_CLASS}
      />
    );
  }
}
