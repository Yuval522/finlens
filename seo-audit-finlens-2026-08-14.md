# FinLens SEO Audit — Full Site Audit

**Site:** finlens-nu.vercel.app
**Date:** August 14, 2026
**Scope:** Full site audit (keyword research, on-page, technical, content gaps, competitor benchmark)

## Executive Summary

FinLens currently has no indexable content for search engines to find. The entire app — including what would normally be a public homepage — is a client-side-rendered single-page app gated behind an authentication check (`AppAuthGate`), so the raw HTML search engines receive is a loading spinner shell with a single generic title tag and nothing else: no body copy, no headings, no per-page metadata. There's also no `robots.txt` and no `sitemap.xml` (both return empty). Every one of the app's seven routes (home, screener, strategy, watchlist, portfolio, analysis/[symbol], settings) shares that one static title/description from the root layout — none has its own metadata, which matters most for `analysis/[symbol]`, the page most naturally shaped to rank for individual stock-ticker searches.

This isn't a "needs work" situation — it's pre-SEO-readiness, and that's actually good news: there's no legacy content to untangle, no thin pages to rewrite, no cannibalized keywords to sort out. The three highest-impact priorities are (1) stand up a public, server-rendered marketing/landing page outside the auth gate with real copy and unique metadata, (2) add `robots.txt` and `sitemap.xml`, and (3) give `analysis/[symbol]` its own dynamic per-page title/description via Next.js's `generateMetadata`, since stock-ticker pages are FinLens's single best source of long-tail search traffic once public.

On the competitive side, the natural-language Strategy Builder combined with TASE (Tel Aviv Stock Exchange) coverage is a genuinely underserved combination — none of the major screening tools (TradingView, Finviz, Koyfin, Simply Wall St) pair AI-driven natural-language screening with Israeli-market data, and the "AI stock screener" competitors that do exist (Trade Ideas, Reflexivity/Toggle AI, Magnifi, Webull Vega, IBKR's AI screener) don't cover TASE at all. That gap is FinLens's clearest path to keyword opportunities that aren't already dominated by Yahoo Finance and Investing.com.

## Keyword Opportunity Table

Reference table for content FinLens should plan to create once a public marketing surface exists — none of these currently have a matching indexable page, since the site has no public pages at all yet.

| Keyword | Est. Difficulty | Opportunity Score | Current Ranking | Intent | Recommended Content Type |
|---|---|---|---|---|---|
| natural language stock screener | Moderate | High | Not ranked | Commercial | Landing page (Strategy Builder feature page) |
| AI stock screener free | Hard | Medium | Not ranked | Commercial | Landing page + comparison content |
| TASE stock screener | Easy | High | Not ranked | Commercial | Landing page, TASE-specific |
| Tel Aviv Stock Exchange charting tool | Easy | High | Not ranked | Commercial | Landing page, TASE-specific |
| how to screen stocks by RSI | Easy | Medium | Not ranked | Informational | Guide/blog post |
| RSI below 30 meaning | Easy | Medium | Not ranked | Informational | Guide/blog post |
| stock screener natural language query | Moderate | High | Not ranked | Commercial | Landing page |
| best free stock screener 2026 | Hard | Low | Not ranked | Commercial | Comparison/listicle (hard to win vs. incumbents) |
| TradingView alternative | Hard | Low | Not ranked | Commercial | Comparison page (only if genuinely differentiated) |
| Finviz alternative | Hard | Low | Not ranked | Commercial | Comparison page |
| screen stocks by moving average crossover | Easy | Medium | Not ranked | Informational | Guide/blog post |
| dividend yield screener | Moderate | Medium | Not ranked | Commercial | Landing page |
| P/E ratio screener | Moderate | Medium | Not ranked | Commercial | Landing page |
| Israeli stock market screener English | Easy | High | Not ranked | Commercial | Landing page, TASE-specific |
| how to build a stock screening strategy | Easy | Medium | Not ranked | Informational | Guide/blog post |
| [ticker] stock analysis (templated, e.g. "AAPL stock analysis") | Hard (per-ticker) | High (in aggregate) | Not ranked | Informational/Commercial | Dynamic per-symbol page (analysis/[symbol]) |
| [ticker] technical indicators RSI SMA | Hard (per-ticker) | High (in aggregate) | Not ranked | Informational | Dynamic per-symbol page |
| watchlist app for stocks | Moderate | Low | Not ranked | Commercial | Landing page |
| financial terminal for individual investors | Moderate | Medium | Not ranked | Commercial | Landing page (matches existing tagline) |
| MACD crossover screener | Easy | Medium | Not ranked | Commercial | Landing page or guide |
| stock screener with technical and fundamental filters | Moderate | Medium | Not ranked | Commercial | Landing page |
| what does relative strength index mean | Easy | Low | Not ranked | Informational | Glossary/guide entry |
| Bollinger Bands screener | Easy | Medium | Not ranked | Commercial | Landing page or guide |
| momentum stock screener | Moderate | Medium | Not ranked | Commercial | Landing page |
| large cap tech stocks screener | Moderate | Medium | Not ranked | Commercial | Landing page (matches existing example query) |

## On-Page Issues Table

| Page | Issue | Severity | Recommended Fix |
|---|---|---|---|
| All routes (site-wide) | Every page shares one static title/description from the root layout — no page distinguishes itself to a search engine or a browser tab | Critical | Add per-route metadata via Next.js's `generateMetadata` (dynamic) or `export const metadata` (static) in each `page.tsx` |
| Homepage (`/`) | No server-rendered body content — raw HTML is a spinner shell only, no H1, no copy, no crawlable text at all | Critical | Add a public, non-gated marketing page (see Technical SEO Checklist) with real server-rendered copy, an H1, and a clear value proposition |
| `analysis/[symbol]` | No dynamic metadata — an Apple stock page and a Tesla stock page report the identical title/description to search engines | Critical | `generateMetadata` reading the symbol param, producing e.g. "AAPL Stock Analysis — Price, RSI, Moving Averages \| FinLens" |
| All routes | No H1 reaches a crawler — content only renders after client-side auth/data hydration completes | High | For any page intended to be public/indexable, move at least the primary heading and value-prop copy to server-rendered output, not behind `AppAuthGate`'s client-only spinner |
| All routes | No canonical tags | Medium | Add canonical URLs once public pages exist, to prevent any future duplicate-URL issues (query params, trailing slashes) |
| All routes | No Open Graph / Twitter Card tags — links shared in Slack, X, or WhatsApp show no preview image or description | Medium | Add `openGraph` and `twitter` fields to `Metadata` in layout/page files, with a branded preview image |
| Strategy Builder page | Rich, genuinely differentiated feature (natural-language + relaxed-match fallback + TASE coverage) has no public-facing explanation anywhere outside the authenticated app | High | Once a marketing page exists, give Strategy Builder its own landing section/page targeting "natural language stock screener" keywords |

## Content Gap Recommendations

Since there's no existing content to compare against competitors, every item below is a "create from scratch" opportunity rather than an "expand existing page" one.

| Topic / Keyword | Why it matters | Recommended Format | Priority | Estimated Effort |
|---|---|---|---|---|
| Public homepage / marketing page | Nothing to index at all right now — this unblocks everything else | Landing page | High | Moderate (half day) |
| "Natural Language Stock Screener" feature page | Differentiated capability, moderate competition, matches product's actual strength | Landing page | High | Moderate |
| TASE / Tel Aviv Stock Exchange screening page | Thin competition — most competitors don't cover TASE at all in English | Landing page | High | Moderate |
| Technical indicator glossary (RSI, MACD, SMA, Bollinger Bands) | High search volume, low difficulty, directly matches Strategy Builder's supported filters | Guide/glossary series | Medium | Substantial (multi-day, but reusable across many keywords) |
| "How to build a stock screening strategy" guide | Bridges informational search intent to the Strategy Builder product | Guide/blog post | Medium | Moderate |
| Per-symbol analysis pages made public/indexable | Long-tail traffic at scale — hundreds of "[ticker] stock analysis" queries | Dynamic page + metadata | High | Moderate (mostly metadata work, page already exists) |
| Comparison content (FinLens vs. Finviz/TradingView) | Only pursue once FinLens has a genuinely distinct public feature set to compare — currently a Critical/High severity gap comes first | Comparison page | Low (for now) | Substantial |

## Technical SEO Checklist

| Check | Status | Details |
|---|---|---|
| robots.txt | Fail | `/robots.txt` returns empty — no directives at all |
| XML sitemap | Fail | `/sitemap.xml` returns empty — doesn't exist |
| Indexable homepage content | Fail | Raw HTML has no body content — client-only rendering behind an auth gate |
| Per-page metadata | Fail | Single static metadata block in root layout only, no `generateMetadata` anywhere in `app/` |
| HTTPS | Pass | Served over HTTPS via Vercel |
| Mobile viewport | Pass | `viewport` meta correctly configured (`width=device-width, initial-scale=1`) |
| Favicon / app icons | Pass | Multi-size icon set configured (favicon.ico, 192/512 PNG, apple-touch-icon) |
| Structured data (schema.org) | Fail | None present — no Organization, WebSite, or FinancialProduct schema |
| Open Graph / social preview tags | Fail | Not present in the metadata block |
| Canonical tags | Fail | Not present |
| Core Web Vitals (observable signals) | Warning | Can't be reliably assessed from the client-rendered shell alone; worth a real Lighthouse/PageSpeed Insights run once there's server-rendered content to measure |

## Competitor Comparison Summary

| Dimension | FinLens | TradingView | Finviz | Simply Wall St / Koyfin |
|---|---|---|---|---|
| Indexable public content | None currently | Extensive (symbol pages, ideas, education) | Extensive (screener results pages, education) | Extensive (company report pages) |
| Natural-language screening | Yes (Strategy Builder) | No | No | No |
| TASE (Israeli market) coverage | Yes | Limited (data only, no dedicated content) | No | No |
| Domain authority signal | New/unestablished | Very high (90M+ users cited) | High | High |
| Content publishing | None yet | Continuous (community + editorial) | Screener-driven, moderate | Editorial reports, continuous |
| Technical SEO foundation | Missing (no sitemap/robots/metadata) | Mature | Mature | Mature |
| Winner | — | TradingView (scale, breadth) | Finviz (screener-first simplicity) | Koyfin/Simply Wall St (fundamentals depth) |

FinLens can't compete on scale or domain authority in the near term. The realistic path is winning narrow, underserved queries (TASE + natural-language screening) where the incumbents above have little to no presence, rather than contesting head-on for "best stock screener"-type terms.

## Prioritized Action Plan

### Quick wins (do this week)

- Add a `robots.txt` (Next.js: `app/robots.ts`) — even a minimal one unblocks crawling. Expected impact: High. Effort: under 1 hour.
- Add an `app/sitemap.ts` listing whatever public routes exist once the marketing page ships. Expected impact: High. Effort: under 1 hour. Dependency: needs at least one public page first.
- Add Open Graph / Twitter Card metadata to the root layout so shared links get a proper preview. Expected impact: Medium. Effort: under 2 hours.
- Write `generateMetadata` for `analysis/[symbol]` so each stock page gets a unique, keyword-relevant title/description. Expected impact: High. Effort: 1–2 hours.

### Strategic investments (plan for this quarter)

- Build a public, server-rendered marketing/landing page outside `AppAuthGate`, with real copy explaining FinLens, the Strategy Builder, and TASE support. Expected impact: High — this is the prerequisite for everything else on this list to matter. Effort: half day to a few days depending on design polish.
- Decide whether `analysis/[symbol]` pages should be publicly viewable (even in a limited/teaser form) to capture long-tail per-ticker search traffic, or stay fully gated. Expected impact: High if made public. Effort: moderate (auth/routing changes, not just metadata).
- Launch a technical-indicator glossary / educational content series (RSI, MACD, SMA, Bollinger Bands) that links back to the Strategy Builder. Expected impact: Medium-High, compounds over time. Effort: substantial, ongoing.
- Build a TASE-specific landing page targeting "Tel Aviv Stock Exchange screener" and related terms — genuinely low-competition territory. Expected impact: High. Effort: moderate.
- Add Organization/WebSite structured data once the public page exists. Expected impact: Medium. Effort: under 1 hour, but depends on the marketing page shipping first.
