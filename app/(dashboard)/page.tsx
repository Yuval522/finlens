import { MarketSummaryGrid } from "@/components/dashboard/MarketSummaryGrid";
import { MostActiveGrid } from "@/components/dashboard/MostActiveGrid";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <MarketSummaryGrid />
      <MostActiveGrid />
    </div>
  );
}
