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

  // QA fix: previously collapsed "not registered" and "fetch failed" into
  // the same {filings: []} shape — see FilingsResult's doc comment in
  // sec-edgar.ts for why that was actively misleading. Pass the real
  // status through so ReportsPanel can show the right message for each.
  const result = await fetchRecentFilings(symbol);
  return NextResponse.json(result);
}
