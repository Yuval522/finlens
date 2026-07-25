import { NextRequest, NextResponse } from "next/server";
import { getFundamentals } from "@/lib/finance/yahoo";
import { MarketDataError } from "@/lib/finance/types";

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

  try {
    const bundle = await getFundamentals(symbol);
    return NextResponse.json(bundle);
  } catch (err) {
    const message =
      err instanceof MarketDataError
        ? err.message
        : `Fundamentals are temporarily unavailable for ${symbol}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
