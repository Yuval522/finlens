import { TrendingUp } from "lucide-react";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { getMostActive } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

const SLOTS = 12;
// Retro-Digital redesign: single-accent orange badge (was emerald).
const ICON_CLASS = "bg-primary/15 text-primary";

/** Async Server Component — fetched inside a <Suspense> boundary on the home page. */
export async function MostActiveSection() {
  try {
    const quotes = await getMostActive();
    return (
      <QuoteCardGrid
        title="Most Active"
        quotes={quotes}
        slots={SLOTS}
        icon={TrendingUp}
        iconClassName={ICON_CLASS}
      />
    );
  } catch (err) {
    const message =
      err instanceof MarketDataError
        ? err.message
        : "Market data is temporarily unavailable.";
    return (
      <QuoteCardGrid
        title="Most Active"
        quotes={[]}
        slots={SLOTS}
        error={message}
        icon={TrendingUp}
        iconClassName={ICON_CLASS}
      />
    );
  }
}
