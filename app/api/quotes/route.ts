import { NextRequest } from "next/server";
import { getQuotes } from "@/lib/finance/yahoo";
import { MarketDataError, type MarketQuote } from "@/lib/finance/types";
import { noStoreJson } from "@/lib/http/noStore";
import { getCurrentUser } from "@/lib/auth/session";
import { getDecryptedApiKey, type ApiKeyProvider } from "@/lib/db/apiKeys";
import { fetchFinnhubQuote } from "@/lib/finance/providers/finnhub";
import { fetchPolygonQuote } from "@/lib/finance/providers/polygon";
import { fetchAlphaVantageQuote } from "@/lib/finance/providers/alphaVantage";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

const FALLBACK_PROVIDERS: { provider: ApiKeyProvider; fetch: (symbol: string, apiKey: string) => Promise<MarketQuote | null> }[] = [
  { provider: "finnhub", fetch: fetchFinnhubQuote },
  { provider: "polygon", fetch: fetchPolygonQuote },
  { provider: "alphaVantage", fetch: fetchAlphaVantageQuote },
];

/**
 * Secure API Keys Migration: fills in any symbol Yahoo's batch call didn't
 * return, using the signed-in user's OWN configured Finnhub/Polygon/Alpha
 * Vantage key as a fallback — the actual "use these keys server-side when
 * calling providers" half of that feature (storage/UI is
 * lib/db/apiKeys.ts + app/api/settings/api-keys/route.ts).
 *
 * Deliberately only runs when there's something to fill in: an anonymous
 * visitor, or a request where Yahoo already returned every symbol (the
 * overwhelming common case for this frequently-polled route), never
 * touches the database or these providers at all — zero added latency on
 * the existing hot path. Tries each configured provider in a fixed
 * priority order per missing symbol and stops at the first one that
 * returns data; a provider that isn't configured for this user, or that
 * fails/times out, is silently skipped (see each provider module's own
 * "never throws" contract) — this is best-effort enrichment, never a
 * reason to fail the whole request.
 */
async function fillMissingQuotesFromUserProviders(symbols: string[], found: MarketQuote[]): Promise<MarketQuote[]> {
  const foundSymbols = new Set(found.map((q) => q.symbol));
  const missing = symbols.filter((s) => !foundSymbols.has(s));
  if (missing.length === 0) return found;

  const user = await getCurrentUser();
  if (!user) return found;

  const keysByProvider = new Map<ApiKeyProvider, string>();
  for (const { provider } of FALLBACK_PROVIDERS) {
    const key = await getDecryptedApiKey(user.id, provider);
    if (key) keysByProvider.set(provider, key);
  }
  if (keysByProvider.size === 0) return found;

  const recovered = await Promise.all(
    missing.map(async (symbol) => {
      for (const { provider, fetch: fetchQuote } of FALLBACK_PROVIDERS) {
        const key = keysByProvider.get(provider);
        if (!key) continue;
        const quote = await fetchQuote(symbol, key);
        if (quote) return quote;
      }
      return null;
    })
  );

  return [...found, ...recovered.filter((q): q is MarketQuote => q !== null)];
}

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return noStoreJson(
      { quotes: [], error: "Provide at least one symbol via ?symbols=AAPL,TEVA.TA" },
      { status: 400 }
    );
  }

  try {
    const yahooQuotes = await getQuotes(symbols);
    const quotes = await fillMissingQuotesFromUserProviders(symbols, yahooQuotes);
    // Mobile state-sync fix: explicit no-store — see lib/http/noStore.ts.
    // force-dynamic above stops Next's own caching, but doesn't by itself
    // stop a mobile browser's or carrier proxy's own HTTP caching of a GET
    // response that otherwise has no Cache-Control header at all.
    return noStoreJson({ quotes });
  } catch (err) {
    const message = err instanceof MarketDataError ? err.message : "Quotes are temporarily unavailable";
    // Yahoo's batch call itself threw (the whole request failed, not just
    // some symbols) — still worth trying the user's own provider keys
    // rather than failing outright, since for THIS user that fallback may
    // fully recover the request even though Yahoo is down.
    try {
      const quotes = await fillMissingQuotesFromUserProviders(symbols, []);
      if (quotes.length > 0) return noStoreJson({ quotes });
    } catch {
      // Fallback attempt itself failed — fall through to the original error below.
    }
    return noStoreJson({ quotes: [], error: message }, { status: 502 });
  }
}
