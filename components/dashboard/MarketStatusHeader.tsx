import { getMarketStatusHeader } from "@/lib/format/marketStatus";

/**
 * Apple-HIG concept redesign — replaces the previous static "Markets /
 * Live quotes across US equities and TASE." header with a time-aware
 * greeting + market-status line (see stox-redesign-concept.html's
 * `.page-head` for the reference this was built against). Plain server
 * component: `getMarketStatusHeader()` is computed once per request (the
 * Home page already opts into `export const dynamic = "force-dynamic"`),
 * so there's no client-side re-derivation and therefore no hydration-
 * mismatch risk — see lib/format/marketStatus.ts's own doc comment.
 */
export function MarketStatusHeader() {
  const { greeting, statusLabel, statusDetail, dateLabel } = getMarketStatusHeader();

  return (
    <div className="mb-2">
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground">{greeting}</h1>
      <p className="mt-1 flex flex-wrap items-center text-[13.5px] text-muted-foreground">
        <span>{statusLabel}</span>
        <span className="mx-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
        <span>{statusDetail}</span>
        <span className="mx-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
        <span>{dateLabel}</span>
      </p>
    </div>
  );
}
