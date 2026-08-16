import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site-url";
import { STRATEGY_UNIVERSE_SYMBOLS } from "@/lib/finance/symbols";

/**
 * SEO audit finding (seo-audit-finlens-2026-08-14.md): /sitemap.xml
 * returned empty. This is the Next.js file convention (app/sitemap.ts)
 * that generates a real one, listing:
 *  - the small set of static top-level pages worth search discovery
 *    (home, screener, strategy builder, macro — deliberately excluding
 *    portfolio/watchlist/settings, same reasoning as robots.ts)
 *  - one entry per symbol in STRATEGY_UNIVERSE_SYMBOLS (lib/finance/
 *    symbols.ts), each now with its own real title/description via
 *    analysis/[symbol]'s generateMetadata — this is what actually invites
 *    a crawl of Stox's single best source of long-tail search traffic
 *    (hundreds of "[ticker] stock analysis" queries) rather than just
 *    making those pages theoretically indexable and hoping they're found.
 *
 * changeFrequency/priority are honest signals, not SEO folklore: ticker
 * pages show a live quote that changes constantly (hence "always"), while
 * the small set of static pages change roughly as often as the product
 * itself does.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/screener`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/strategy`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/macro`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
  ];

  const symbolPages: MetadataRoute.Sitemap = STRATEGY_UNIVERSE_SYMBOLS.map((symbol) => ({
    url: `${siteUrl}/analysis/${encodeURIComponent(symbol)}`,
    lastModified: now,
    changeFrequency: "always",
    priority: 0.7,
  }));

  return [...staticPages, ...symbolPages];
}
