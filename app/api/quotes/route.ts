import { NextRequest } from "next/server";
import { getQuotes } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";
import { noStoreJson } from "@/lib/http/noStore";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

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
    const quotes = await getQuotes(symbols);
    // Mobile state-sync fix: explicit no-store — see lib/http/noStore.ts.
    // force-dynamic above stops Next's own caching, but doesn't by itself
    // stop a mobile browser's or carrier proxy's own HTTP caching of a GET
    // response that otherwise has no Cache-Control header at all.
    return noStoreJson({ quotes });
  } catch (err) {
    const message = err instanceof MarketDataError ? err.message : "Quotes are temporarily unavailable";
    return noStoreJson({ quotes: [], error: message }, { status: 502 });
  }
}
