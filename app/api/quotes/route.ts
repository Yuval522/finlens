import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      { quotes: [], error: "Provide at least one symbol via ?symbols=AAPL,TEVA.TA" },
      { status: 400 }
    );
  }

  try {
    const quotes = await getQuotes(symbols);
    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof MarketDataError ? err.message : "Quotes are temporarily unavailable";
    return NextResponse.json({ quotes: [], error: message }, { status: 502 });
  }
}
