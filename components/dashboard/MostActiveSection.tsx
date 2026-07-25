import { TrendingUp } from "lucide-react";
import { QuoteCardGrid } from "@/components/dashboard/QuoteCardGrid";
import { getMostActive } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

const SLOTS = 12;
const ICON_CLASS = "bg-emerald-500/15 text-emerald-400";

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
