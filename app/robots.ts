import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site-url";

/**
 * SEO audit finding (seo-audit-finlens-2026-08-14.md): /robots.txt
 * returned empty — no crawl directives at all. This is the Next.js file
 * convention (app/robots.ts) that generates a real one at build/request
 * time instead of a static public/robots.txt, so it can share
 * getSiteUrl() with sitemap.ts and the root layout rather than hardcoding
 * the domain in three separate places.
 *
 * Portfolio/watchlist/settings are disallowed — they're per-user views,
 * not content anyone should discover via search, and there's no benefit
 * to inviting a crawler there. Everything else (home, screener, strategy,
 * analysis/[symbol], macro) is allowed, since those are the pages this
 * app actually wants found.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/portfolio", "/watchlist", "/settings"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
