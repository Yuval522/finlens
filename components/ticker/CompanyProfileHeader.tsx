import { Globe, User } from "lucide-react";
import type { CompanyProfile, MarketQuote } from "@/lib/finance/types";
import { CompanyLogo } from "@/components/dashboard/CompanyLogo";
import { WatchlistButton } from "@/components/shared/WatchlistButton";

interface CompanyProfileHeaderProps {
  quote: MarketQuote;
  profile: CompanyProfile;
}

export function CompanyProfileHeader({ quote, profile }: CompanyProfileHeaderProps) {
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
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
          <h1 className="truncate text-base font-semibold text-foreground">{quote.name}</h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
              {quote.symbol}
            </span>
            <span className="text-xs text-muted-foreground">{quote.exchange}</span>
          </div>
        </div>
        <WatchlistButton symbol={quote.symbol} size={18} className="mt-0.5" />
      </div>

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
