import { NextRequest, NextResponse } from "next/server";
import { fetchRecentFilings } from "@/lib/finance/providers/sec-edgar";

// Live upstream data — never let Next statically cache this route.
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = decodeURIComponent(rawSymbol).trim();

  if (!symbol) {
    return NextResponse.json({ error: "No symbol provided" }, { status: 400 });
  }

  const result = await fetchRecentFilings(symbol);
  if (!result) {
    // Not an error state for the UI — just means SEC EDGAR has no match
    // for this symbol (non-US-listed, not SEC-registered) or the request
    // failed. ReportsPanel renders an empty/unavailable state either way.
    return NextResponse.json({ filings: [], companyName: null, cik: null });
  }

  return NextResponse.json(result);
}
