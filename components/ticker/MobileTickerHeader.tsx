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
      {/* Mobile UX audit fix: p-2 around a 16px icon (~32px total) was under
          the ~44px minimum touch target — this is the only way back to the
          dashboard on mobile (no persistent nav), so it matters more here
          than most controls in the app. */}
      <Link
        href="/"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 text-foreground backdrop-blur-xl transition-colors hover:bg-foreground/10"
        aria-label="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <CompanyLogo symbol={quote.symbol} name={quote.name} size={36} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-sm font-semibold text-foreground">{quote.name}</h1>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="hig-badge text-[11px]">{quote.symbol}</span>
          <span className="text-[11px] text-muted-foreground">{quote.exchange}</span>
        </div>
      </div>
    </div>
  );
}
