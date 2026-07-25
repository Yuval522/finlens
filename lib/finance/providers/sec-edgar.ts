/**
 * SEC EDGAR — real, free, keyless public filing data used by the Reports
 * tab. Unlike FMP (lib/finance/providers/fmp.ts), this needs no API key at
 * all: EDGAR's JSON endpoints are open to anyone who sends a proper,
 * identifying User-Agent header (SEC's fair-access policy — requests
 * without one get blocked). We default to a generic app-identifying
 * string but let it be overridden via SEC_EDGAR_CONTACT env var so a real
 * deployment can put a real contact email in it, which is what SEC
 * actually asks for and reduces the odds of the shared default getting
 * rate-limited if many people run this app unmodified.
 *
 * IMPORTANT — unverified live in this environment: outbound network access
 * to data.sec.gov / www.sec.gov is blocked by this sandbox's egress proxy
 * (the same restriction already documented for Yahoo Finance and FMP), so
 * these calls could not be exercised end-to-end here. The request shapes
 * below follow SEC's publicly documented EDGAR APIs. Spot-check against a
 * real deployment before relying on it, the same way you would for any
 * third-party integration built without the ability to hit the real
 * endpoint during development.
 */

const USER_AGENT = process.env.SEC_EDGAR_CONTACT || "FinLens/1.0 (contact: set SEC_EDGAR_CONTACT env var)";

let tickerMapPromise: Promise<Map<string, { cik: number; name: string }> | null> | null = null;

/**
 * SEC's full ticker->CIK map (~800KB, all US-listed/SEC-registered
 * filers). Fetched once per server lifetime and cached in-memory — this
 * list changes rarely enough that a TTL isn't worth the added complexity.
 */
async function getTickerMap(): Promise<Map<string, { cik: number; name: string }> | null> {
  if (!tickerMapPromise) {
    tickerMapPromise = (async () => {
      try {
        const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
          headers: { "User-Agent": USER_AGENT },
          next: { revalidate: 86400 }, // filers list changes rarely — daily is plenty
        });
        if (!res.ok) return null;
        const raw = (await res.json()) as Record<
          string,
          { cik_str: number; ticker: string; title: string }
        >;
        const map = new Map<string, { cik: number; name: string }>();
        for (const entry of Object.values(raw)) {
          map.set(entry.ticker.toUpperCase(), { cik: entry.cik_str, name: entry.title });
        }
        return map;
      } catch {
        return null;
      }
    })();
  }
  return tickerMapPromise;
}

/**
 * Strips exchange suffixes (".TA", ".L", etc.) to get the bare ticker SEC's
 * map is keyed by — SEC only covers US-listed / SEC-registered filers, so
 * this is a best-effort match (e.g. "TEVA.TA" -> "TEVA", which *does*
 * resolve, since Teva files 20-F/6-K with the SEC as a foreign private
 * issuer under its US ADR ticker).
 */
function bareSymbol(symbol: string): string {
  return symbol.split(".")[0].toUpperCase();
}

export interface FilingRecord {
  form: string;
  filingDate: string;
  reportDate: string | null;
  description: string | null;
  accessionNumber: string;
  /** Direct link to the primary filing document on SEC EDGAR. */
  url: string;
}

export interface CompanyFilings {
  cik: number;
  companyName: string;
  filings: FilingRecord[];
}

const REPORT_FORM_TYPES = new Set(["10-K", "10-Q", "20-F", "6-K", "10-K/A", "10-Q/A"]);

/**
 * Recent 10-K/10-Q (or 20-F/6-K for foreign private issuers) filings for a
 * symbol, newest first. Returns null if the symbol can't be matched to a
 * CIK or the EDGAR request fails — callers should treat that as "reports
 * unavailable" rather than an error, same as every other optional
 * enrichment source in this app.
 */
export async function fetchRecentFilings(symbol: string, limit = 12): Promise<CompanyFilings | null> {
  const map = await getTickerMap();
  const match = map?.get(bareSymbol(symbol));
  if (!match) return null;

  const cikPadded = String(match.cik).padStart(10, "0");
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const recent = data?.filings?.recent;
    if (!recent?.form) return null;

    const filings: FilingRecord[] = [];
    for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
      const form = String(recent.form[i]);
      if (!REPORT_FORM_TYPES.has(form)) continue;

      const accessionNumber = String(recent.accessionNumber[i]);
      const primaryDocument = String(recent.primaryDocument[i] ?? "");
      const accessionNoDashes = accessionNumber.replace(/-/g, "");

      filings.push({
        form,
        filingDate: String(recent.filingDate[i]),
        reportDate: recent.reportDate?.[i] ? String(recent.reportDate[i]) : null,
        description: recent.primaryDocDescription?.[i] ? String(recent.primaryDocDescription[i]) : null,
        accessionNumber,
        url: `https://www.sec.gov/Archives/edgar/data/${match.cik}/${accessionNoDashes}/${primaryDocument}`,
      });
    }

    return { cik: match.cik, companyName: match.name, filings };
  } catch {
    return null;
  }
}
