import { useMemo } from "react";
import { Database } from "lucide-react";
import { formatSourceSummary, summarizeYearSources, type YearRow } from "@/lib/finance/aggregate";

interface SourceAttributionBadgeProps<T extends YearRow> {
  years: T[];
}

/**
 * Small transparency caption for the multi-source aggregation pipeline
 * (see lib/finance/aggregate.ts): shows exactly which provider each fiscal
 * year's figures came from, e.g. "2016-2023: SEC EDGAR · 2024-2026: Yahoo
 * Finance". Renders nothing for mock/demo data (rows have no `dataSource`
 * tag — see FinancialDataSource's doc comment in lib/finance/types.ts) or
 * once merged data happens to come entirely from a single source with
 * nothing else worth calling out... actually always renders when there's
 * at least one tagged row, single-source included, so it's never
 * ambiguous whether a given chart is showing real attributed data.
 */
export function SourceAttributionBadge<T extends YearRow>({ years }: SourceAttributionBadgeProps<T>) {
  const summary = useMemo(() => formatSourceSummary(summarizeYearSources(years)), [years]);
  if (!summary) return null;
  return (
    <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
      <Database className="h-3 w-3 shrink-0" />
      <span>
        <span className="font-medium text-muted-foreground/80">Sources:</span> {summary}
      </span>
    </p>
  );
}
