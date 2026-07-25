import { computeRatios } from "@/lib/finance/ratios";
import type { BalanceSheetYear, IncomeStatementYear, TickerMetrics } from "@/lib/finance/types";

interface RatiosPanelProps {
  income: IncomeStatementYear[];
  balance: BalanceSheetYear[];
  metrics: TickerMetrics;
}

function formatValue(value: number | null, format: "ratio" | "percent"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return format === "percent" ? `${value.toFixed(1)}%` : `${value.toFixed(2)}x`;
}

export function RatiosPanel({ income, balance, metrics }: RatiosPanelProps) {
  const categories = computeRatios({ income, balance, metrics });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      {categories.map((category) => (
        <div key={category.title} className="glass-card min-w-0 rounded-xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{category.title}</h3>
          <dl className="space-y-2.5">
            {category.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground" title={item.note}>
                  {item.label}
                  {item.note && (
                    <span className="text-[10px] text-muted-foreground/70" aria-hidden="true">
                      *
                    </span>
                  )}
                </dt>
                <dd className="font-mono text-sm font-medium text-foreground">
                  {formatValue(item.value, item.format)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <p className="sm:col-span-2 text-[10px] text-muted-foreground">
        * Quick Ratio is approximated as Cash &amp; ST Investments ÷ Current Liabilities — inventory and
        receivables aren&apos;t broken out separately in this data model.
      </p>
    </div>
  );
}
