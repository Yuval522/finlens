/**
 * Canonical, protocol-included site URL — the single source of truth for
 * everything that needs an absolute URL for SEO purposes (metadataBase,
 * robots.txt's sitemap reference, sitemap.xml entries, Open Graph URLs).
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_SITE_URL — set this explicitly once a custom domain
 *    replaces the vercel.app one; nothing else in this file needs to
 *    change when that happens.
 * 2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's own system env var for this
 *    project's stable production domain (unlike VERCEL_URL, which is a
 *    new, unique URL on every single deployment/preview and would make
 *    every preview deploy claim to be a different "canonical" site).
 * 3. A hardcoded fallback (the current production domain) — so local dev
 *    and any environment missing both vars above still produces valid,
 *    absolute URLs instead of throwing or emitting relative ones. Updated
 *    to stox-intellegens.vercel.app for the Stox rebrand (was
 *    finlens-nu.vercel.app) — VERCEL_PROJECT_PRODUCTION_URL will normally
 *    take precedence over this in the actual deployed environment, but
 *    this fallback should still track the real domain in case that var is
 *    ever unset.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://stox-intellegens.vercel.app";
}
