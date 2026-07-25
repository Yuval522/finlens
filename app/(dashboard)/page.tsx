import { Suspense } from "react";
import { MarketSummaryGrid } from "@/components/dashboard/MarketSummaryGrid";
import { MarketSummarySection } from "@/components/dashboard/MarketSummarySection";
import { MostActiveGrid } from "@/components/dashboard/MostActiveGrid";
import { MostActiveSection } from "@/components/dashboard/MostActiveSection";

// Live quotes — fetch fresh on every request rather than baking prices in
// at build time.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<MarketSummaryGrid />}>
        <MarketSummarySection />
      </Suspense>
      <Suspense fallback={<MostActiveGrid />}>
        <MostActiveSection />
      </Suspense>
    </div>
  );
}
