import { Suspense } from "react";
import { MarketStatusHeader } from "@/components/dashboard/MarketStatusHeader";
import { MarketSummaryGrid } from "@/components/dashboard/MarketSummaryGrid";
import { MarketSummarySection } from "@/components/dashboard/MarketSummarySection";
import { MostActiveGrid } from "@/components/dashboard/MostActiveGrid";
import { MostActiveSection } from "@/components/dashboard/MostActiveSection";
import { BigSevenGrid } from "@/components/dashboard/BigSevenGrid";
import { BigSevenSection } from "@/components/dashboard/BigSevenSection";

// Live quotes — fetch fresh on every request rather than baking prices in
// at build time.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    // Apple-HIG concept redesign: this page opts into the .hig-bg radial
    // accent wash and a left-aligned header, a deliberate departure from
    // docs/design-system.md's site-wide centered icon-less hero pattern —
    // scoped to this page only, no other route is affected. MarketStatusHeader
    // is a time-aware greeting + market-status line computed server-side
    // per request (see its own doc comment for why that's still safe from
    // a hydration-mismatch standpoint despite no longer being static copy).
    // Negative margin + matching padding exactly cancels out
    // DashboardShell's <main> padding (p-4 md:p-6) so the radial wash
    // bleeds to the shell's true edges instead of leaving a flat,
    // un-tinted border around it.
    <div className="hig-bg -m-4 space-y-8 p-4 md:-m-6 md:p-6">
      <MarketStatusHeader />
      <Suspense fallback={<MarketSummaryGrid />}>
        <MarketSummarySection />
      </Suspense>
      <Suspense fallback={<MostActiveGrid />}>
        <MostActiveSection />
      </Suspense>
      <Suspense fallback={<BigSevenGrid />}>
        <BigSevenSection />
      </Suspense>
    </div>
  );
}
