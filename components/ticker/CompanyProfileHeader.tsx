import { Globe, User } from "lucide-react";
import type { CompanyProfile, MarketQuote } from "@/lib/finance/types";

interface CompanyProfileHeaderProps {
  quote: MarketQuote;
  profile: CompanyProfile;
}

function initials(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyProfileHeader({ quote, profile }: CompanyProfileHeaderProps) {
  const websiteLabel = profile.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-700 text-sm font-bold text-white shadow-lg shadow-primary/20">
          {initials(quote.name)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-foreground">{quote.name}</h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
              {quote.symbol}
            </span>
            <span className="text-xs text-muted-foreground">{quote.exchange}</span>
          </div>
        </div>
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
