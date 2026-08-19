import { Info } from "lucide-react";
import { nonFundamentalAssetLabel } from "@/lib/finance/exchange";

interface NonFundamentalNoticeProps {
  symbol: string;
  quoteType?: string | null;
}

/**
 * QA fix (live report: ETFs like SPCX either crashed the fundamentals
 * fetch entirely — see the quoteSummary .catch() fix in yahoo.ts's
 * getFundamentals() — or, once that was fixed, simply had the entire
 * fundamentals tab strip silently vanish with no explanation). Shown in
 * AnalysisPage wherever isNonFundamentalQuote() is true (ETFs, mutual
 * funds, indices, commodities, currency pairs, crypto), in the exact spot
 * <DataExplorerTabs> would otherwise render, so the user gets an explicit,
 * on-brand explanation instead of either a broken error or a page that
 * just looks like a chunk of it failed to load. Deliberately calm/neutral
 * styling (Info icon, not AlertTriangle) — this is expected behavior for
 * this asset class, not something gone wrong.
 */
export function NonFundamentalNotice({ symbol, quoteType }: NonFundamentalNoticeProps) {
  const label = nonFundamentalAssetLabel(symbol, quoteType);

  return (
    <div className="hig-card flex flex-col items-center gap-3 !border-dashed px-6 py-14 text-center">
      <Info className="h-7 w-7 text-muted-foreground" />
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">Fundamentals Not Available</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          <span className="font-mono">{symbol}</span> is {label} — it doesn&apos;t file an income
          statement, balance sheet, or cash flow statement of its own, so there&apos;s no
          company-level fundamentals data to show here. Live price and chart data above are still
          fully available.
        </p>
      </div>
    </div>
  );
}
