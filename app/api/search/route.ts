import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchSymbols(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof MarketDataError ? err.message : "Search is temporarily unavailable";
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
