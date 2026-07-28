# Alternative Data Sources & Cross-Validation — Feasibility Evaluation

**Scope:** Google Finance integration feasibility, Apple Stocks app backend benchmark, and a multi-source data-triangulation/conflict-resolution design for `lib/finance/`.

**Status:** research and evaluation complete for items 1–2 (recommendation: do not integrate Google Finance; Apple Stocks confirms our existing choice of Yahoo, not a new option). Item 3 (cross-validation) is implemented and shipped in `lib/finance/aggregate.ts` + wired into `yahoo.ts`.

---

## 1. Google Finance — not viable as an integration target

**Official API: gone, not coming back.** Google shut down the Google Finance API in 2011 and fully decommissioned it on October 20, 2012. There has been no indication since of it returning.

**The only remaining Google-native access point is `GOOGLEFINANCE()`, a Google Sheets formula** — not an API. It has three disqualifying limitations for this app:

1. **Fundamentals coverage is essentially nil.** `GOOGLEFINANCE()` exposes only P/E ratio and EPS — no revenue, no net income, no balance sheet, no cash flow. It cannot replace or cross-check any of the Income/Balance/Cash Flow statement data this app already pulls from SEC EDGAR/Yahoo/FMP; it isn't a fundamentals source at all.
2. **It's not real-time and not documented as an API contract.** Quotes are delayed up to 20 minutes and the function is explicitly a spreadsheet convenience, not a stable service with published rate limits, SLAs, or a terms-of-service grant for embedding in a third-party product.
3. **There is no supported way to call it outside Google Sheets.** Using it here would mean either (a) driving an actual Google Sheet as a scraping intermediary, which is fragile and roundabout, or (b) reverse-engineering the same internal endpoint the formula calls — which is scraping, not integration (see below).

**Scraping the live Google Finance website is the only remaining path, and it's a real liability, not just "fragile."** Beyond the practical issues (page markup and CSS selectors change frequently, breaking scrapers without notice), there is live legal precedent specifically on this point: Google filed a DMCA lawsuit against SerpApi in December 2025 over scraping Google's own properties (hearing scheduled May 2026). Building a production feature on top of unauthorized scraping of a Google product is a direct legal exposure for this app, not a hypothetical one.

**Recommendation: do not integrate Google Finance in any form.** It adds legal risk, has essentially no fundamentals data even if it worked, and every fundamentals gap it might have plugged is already better served by the EODHD path documented in `docs/data-pipeline-architecture.md`.

---

## 2. Apple Stocks app — confirms, rather than expands, the existing provider choice

Apple's built-in iOS Stocks app has **no public API of its own** — it's a native OS app, not a service with documented endpoints. The relevant question was who supplies *its* backend data, to see whether that supplier is worth adopting.

**Finding: Apple Stocks' quote/fundamentals data is Yahoo Finance.** This is corroborated directly by user reports on Apple's own support forums (Apple Community discussions from 2018 through 2023 show users specifically asking Apple to *stop* using Yahoo Finance data in the Stocks app, confirming it was — and per the most recent threads, still is — the active backend). Apple layers its own native UI, watchlist sync (iCloud), and a "Business News" panel sourced separately through Apple News (aggregating outlets like Bloomberg, WSJ, CNBC for headlines, not quote/fundamentals data) on top of that Yahoo feed.

**Implication for this app: we already use the same core data source Apple's Stocks app relies on.** `lib/finance/yahoo.ts` already sits on the identical `yahoo-finance2` data path. There is no separate "Apple-grade" provider to adopt — matching Apple Stocks' reliability/speed is really a question of how well *we* use Yahoo (rate-limit handling, caching, background refresh), which this codebase already addresses via `TtlCache`, `useBackgroundRefresh`, and `useLiveQuotes` (see prior work: the 7s live-quote polling overlay and 60s persisted background refresh on ticker/Watchlist/Portfolio pages). There's no new integration work this finding recommends — it's a validation that the existing Yahoo dependency was the right call, not a gap.

---

## 3. Multi-source cross-validation & conflict resolution — implemented

### Design

Every statement fetch already queries SEC EDGAR, Yahoo, and (when configured) FMP **in parallel**, regardless of which one ends up "winning" a given fiscal year under the existing priority-order merge (`mergeYearsBySource` in `aggregate.ts`). That means the data needed to cross-check providers against each other was already being fetched and then discarded — this change puts it to use instead of throwing it away.

**What changed:** `mergeYearsBySource()` gained an optional `anchorField` parameter. When provided, and when a given fiscal year has data from **all three** sources, the function compares each source's value for that one anchor field (the statement's single most universally-defined figure — `totalRevenue` for income, `totalAssets` for balance, `operatingCashFlow` for cash flow) instead of blindly trusting priority order:

- If the two *lower*-priority sources agree closely with each other (within 2%) but the priority winner diverges sharply from **both** of them (>8% from each), that's a 2-against-1 majority against the winner — treated as a real signal, not routine provider noise, and the row is demoted to the next-best source instead.
- Demotion swaps the **whole row**, never individual fields — preserving this codebase's existing, deliberate "never blend fields across sources" principle (the same principle that made the earlier fabricated-$0-revenue bug fixable by widening one source's own tag coverage, not by borrowing fields from another source). The `dataSource` attribution tag is updated to reflect whichever source actually won after the check, so the UI badges stay accurate.
- Every other case — fewer than 3 sources present for that year, or a genuine 3-way disagreement with no 2-source majority — leaves the original priority order untouched and does **not** silently pick a "resolution." This is deliberate: with no clear corroboration, an algorithmic tie-break would just be a guess, and this codebase's standing principle (established across the revenue-derivation fix, the TTM gap-detection in `ttm.ts`, and the historical-depth honesty in `sec-edgar.ts`) is to avoid fabricating confidence where none exists.

**Anomaly/stale-figure flagging:** when a demotion happens, a `console.warn` fires (dev-only, matching the existing `warnIfYearsLookStale`/`warnIfDuplicateValuesAcrossYears` diagnostic conventions already in this file) naming the outlier source, its value, and the two corroborating sources' values — so a developer can immediately see *which* provider was wrong for *which* year, not just that "something disagreed."

**Missing-year gap detection** (the "pre-2009 gap" part of the ask) doesn't need new code: `mergeYearsBySource` already unions every year any source reports (nothing is dropped for lack of a "vote"), and the existing per-year source-attribution badges plus `logSourceBreakdown` already show exactly where each source's coverage starts and stops. If SEC EDGAR, Yahoo, and FMP all independently floor out around the same year for a given filer, that convergence *is* the signal that a real structural depth wall exists (as documented in `sec-edgar.ts` and `docs/data-pipeline-architecture.md`) rather than one source's fetch simply failing — the fix for that is adding a source with genuinely different coverage (EODHD), not a smarter merge algorithm.

### Where it's wired in

All six `mergeYearsBySource` call sites in `getFundamentals()` (`yahoo.ts`) now pass an anchor field: `income`/`incomeQuarterly` → `totalRevenue`, `balance`/`balanceQuarterly` → `totalAssets`, `cashFlow`/`cashFlowQuarterly` → `operatingCashFlow`.

### Why this activates rarely in practice, by design

FMP is opt-in (`FMP_API_KEY`) and most deployments won't have it configured, so the 3-source condition for triangulation won't be met most of the time — the system gracefully degrades to the original 2-source (or 1-source) priority merge, unchanged. This is intentional: the override is a genuine majority-vote mechanism, and a majority vote needs three independent voters to mean anything. Configuring `FMP_API_KEY` doesn't just add a fallback source anymore — it also activates real cross-validation for every symbol FMP covers.

### Verified

`npx tsc --noEmit`, `npx next lint`, and `npx next build` all pass clean against this change (see commit for `lib/finance/aggregate.ts` and `lib/finance/yahoo.ts`).

---

## Sources

- [Google Finance API and the Best Alternatives for Developers (2026)](https://scrapfly.io/blog/posts/guide-to-google-finance-api)
- [Google Finance API: What Happened + 2026 Alternatives | ScrapeBadger](https://scrapebadger.com/blog/google-finance-api-what-happened-to-it-and-what-to-use-in-2026)
- [GoogleFinance Function Advanced Tutorial 2026 | Coupler.io Blog](https://blog.coupler.io/googlefinance-function-advanced-tutorial/)
- [GOOGLEFINANCE Alternative: 1,000+ Functions for Google Sheets | MarketXLS](https://marketxls.com/blog/googlefinance-alternative)
- [Stocks App still Uses Yahoo Finance which… — Apple Community](https://discussions.apple.com/thread/253827975)
- [Stocks app still using yahoo finance — Apple Community](https://discussions.apple.com/thread/254750718)
- [Stocks: change Yahoo Finance to Ap… | Apple Developer Forums](https://developer.apple.com/forums/thread/103983)
