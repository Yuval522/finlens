import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { MarketQuote } from "@/lib/finance/types";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";

interface MobileTickerHeaderProps {
  quote: MarketQuote;
}

/**
 * QA fix (mobile UX audit): the analysis page's `order-1`/`order-2` flex
 * reordering puts the price/chart/tabs column FIRST on mobile (so the price
 * is visible without scrolling) and the profile card — which is the ONLY
 * place CompanyLogo renders on this page — SECOND, well below the fold.
 * Net effect on a phone: no logo anywhere near the top, and no way back to
 * the dashboard short of the browser's own back button (the sidebar is a
 * hidden drawer behind the hamburger, not a persistent nav on mobile).
 *
 * Rather than fight the existing order-1/order-2 stacking (which the
 * sticky-profile-card desktop layout depends on — see the page's own doc
 * comments), this renders a small, separate, mobile-only (`lg:hidden`)
 * header ABOVE that whole flex row, so it's always the very first thing on
 * screen on a phone regardless of how the row beneath it reorders. Hidden
 * entirely at `lg:` and up, where the sticky profile card in the left
 * column already shows the logo and the Topbar/Sidebar provide navigation.
 */
export function MobileTickerHeader({ quote }: MobileTickerHeaderProps) {
  return (
    <div className="mb-4 flex items-center gap-3 lg:hidden">
      <Link
        href="/"
        className="flex shrink-0 items-center justify-center rounded-full border border-border bg-accent/60 p-2 text-foreground transition-colors hover:bg-accent"
        aria-label="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <CompanyLogo symbol={quote.symbol} name={quote.name} size={36} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-foreground">{quote.name}</h1>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
            {quote.symbol}
          </span>
          <span className="text-[11px] text-muted-foreground">{quote.exchange}</span>
        </div>
      </div>
    </div>
  );
}
