import { Globe2 } from "lucide-react";
import { MACRO_SERIES } from "@/lib/macro/data";
import { MacroIndicatorCard } from "@/components/macro/MacroIndicatorCard";

export default function MacroPage() {
  return (
    <div className="space-y-6">
      {/* Retro-Digital redesign: page hero centered (icon, title, subtitle
          stacked) instead of the old left-aligned icon+title row. */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Globe2 className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Macro & Economic Overview</h1>
          <p className="text-xs text-muted-foreground">Key global economic indicators, illustrative historical trends</p>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {MACRO_SERIES.map((series) => (
          <MacroIndicatorCard key={series.id} series={series} />
        ))}
      </div>
    </div>
  );
}
