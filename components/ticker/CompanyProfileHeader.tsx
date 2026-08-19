import { Globe, User } from "lucide-react";
import type { CompanyProfile, MarketQuote } from "@/lib/finance/types";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { WatchlistButton } from "@/components/shared/WatchlistButton";
import { toDisplayUnit } from "@/lib/format/currency";

interface CompanyProfileHeaderProps {
  quote: MarketQuote;
  profile: CompanyProfile;
  /**
   * True for indices/ETFs/crypto/etc. — see isNonFundamentalQuote() in
   * lib/finance/exchange.ts, same flag the Analysis page uses to hide the
   * fundamentals tab strip. Passed down here for the opposite reason: this
   * category has no sector/industry/CEO/website (the `dl` below renders
   * empty for it), leaving a dead patch of whitespace right under the
   * name — see MarketDataStats below, which fills it with the numbers
   * that actually ARE meaningful for an index/ETF/crypto quote.
   */
  isNonFundamental?: boolean;
}

/** One row of the Market Data stats grid — label left, mono value right, matches the `dl` rows below it in spacing/type so the two blocks read as one continuous list. */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Live report (screenshot, FTSE 100): the left profile panel for an index
 * showed only the logo/name/ticker/exchange, then nothing — no
 * sector/industry/CEO/website to fill the `dl` below (indices have none of
 * those), so the card ended in a large patch of empty whitespace. This
 * fills that space with the numbers an index actually has: previous close,
 * today's open, day's range, and 52-week range — sourced straight off
 * `quote` (dayOpen/dayHigh/dayLow/previousClose/weekHigh52/weekLow52),
 * same fields PriceHeaderBlock's "Day Range" strip already uses above the
 * chart, just surfaced here too since that block can scroll out of view.
 *
 * Deliberately NOT currency-symbol-prefixed (toDisplayUnit only, no
 * formatPrice) — same reasoning as IndexSummaryCard's main value: an index
 * "level" isn't really a currency amount you'd trade at, even though the
 * underlying quote object still carries a `currency` field for unit
 * conversion (e.g. TA-125's ILA/agorot). A plain, unprefixed number matches
 * how every index/ticker service displays these.
 */
function MarketDataStats({ quote }: { quote: MarketQuote }) {
  const fmt = (value: number | null) =>
    value == null
      ? "—"
      : toDisplayUnit(value, quote.currency).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const dayRange =
    quote.dayLow != null && quote.dayHigh != null ? `${fmt(quote.dayLow)} – ${fmt(quote.dayHigh)}` : "—";
  const weekRange =
    quote.weekLow52 != null && quote.weekHigh52 != null ? `${fmt(quote.weekLow52)} – ${fmt(quote.weekHigh52)}` : "—";

  const hasAnyStat =
    quote.previousClose != null || quote.dayOpen != null || dayRange !== "—" || weekRange !== "—";
  if (!hasAnyStat) return null;

  return (
    <dl className="mt-4 space-y-2 border-t border-foreground/8 pt-4 text-xs">
      <StatRow label="Previous Close" value={fmt(quote.previousClose)} />
      <StatRow label="Open" value={fmt(quote.dayOpen)} />
      <StatRow label="Day's Range" value={dayRange} />
      <StatRow label="52-Week Range" value={weekRange} />
    </dl>
  );
}

export function CompanyProfileHeader({ quote, profile, isNonFundamental }: CompanyProfileHeaderProps) {
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  return (
    <div className="hig-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {/*
          QA fix: this used to always fall back to a generic letter-avatar,
          even though the same real-logo-with-fallback CompanyLogo component
          (FMP image CDN, initials/caret badge on failure) already existed
          and worked correctly on the home dashboard cards. Reusing it here
          means a resolvable logo now actually renders instead of unions
          always dropping straight to initials.
        */}
        <CompanyLogo symbol={quote.symbol} name={quote.name} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-semibold text-foreground">{quote.name}</h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="hig-badge">{quote.symbol}</span>
            <span className="text-xs text-muted-foreground">{quote.exchange}</span>
          </div>
        </div>
        <WatchlistButton symbol={quote.symbol} size={18} className="mt-0.5" />
      </div>

      {isNonFundamental && <MarketDataStats quote={quote} />}

      <dl className="mt-4 space-y-2 text-xs">
        {profile.sector && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Sector</dt>
            <dd className="font-medium text-foreground">{profile.sector}</dd>
          </div>
        )}
        {profile.industry && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Industry</dt>
            <dd className="text-right font-medium text-foreground">{profile.industry}</dd>
          </div>
        )}
        {profile.ceo && (
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <User className="h-3 w-3" /> CEO
            </dt>
            <dd className="font-medium text-foreground">{profile.ceo}</dd>
          </div>
        )}
        {profile.website && (
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Globe className="h-3 w-3" /> Website
            </dt>
            <dd className="truncate">
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {websiteLabel}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {profile.description && (
        <p className="mt-4 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {profile.description}
        </p>
      )}
    </div>
  );
}
