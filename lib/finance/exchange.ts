/**
 * Best-effort exchange -> currency mapping used to badge search results
 * before a full quote (with authoritative currency) is fetched. Yahoo's
 * `search` endpoint doesn't return currency, only `quote` does — this is a
 * display heuristic, not a source of truth for pricing.
 */
const EXCHANGE_CURRENCY: Record<string, string> = {
  TLV: "ILA",
  TASE: "ILA",
  LSE: "GBp",
  LON: "GBp",
  XETRA: "EUR",
  GER: "EUR",
  FRA: "EUR",
  EBS: "EUR",
  TSX: "CAD",
  TSXV: "CAD",
  TOR: "CAD",
  MEX: "MXN",
  MEXICO: "MXN",
};

export function guessCurrencyFromExchange(exchange: string | undefined | null): string {
  if (!exchange) return "USD";
  return EXCHANGE_CURRENCY[exchange.toUpperCase()] ?? "USD";
}

/** Short, badge-friendly exchange label (Yahoo's raw codes are inconsistent — NMS, NYQ, etc). */
const EXCHANGE_LABELS: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NYQ: "NYSE",
  ASE: "NYSE American",
  PCX: "NYSE Arca",
  BTS: "BATS",
  TLV: "TLV",
  TASE: "TLV",
  LSE: "LSE",
  LON: "LSE",
  GER: "XETRA",
  FRA: "XETRA",
  EBS: "XETRA",
  TOR: "TSX",
  MEX: "MEX",
};

export function toExchangeBadge(exchange: string | undefined | null): string {
  if (!exchange) return "—";
  const upper = exchange.toUpperCase();
  return EXCHANGE_LABELS[upper] ?? exchange;
}

/** True for TASE (Tel Aviv Stock Exchange) listings — symbol suffix (.TA) or exchange code (TLV/TASE). */
export function isTaseListing(
  symbol: string | undefined | null,
  exchange: string | undefined | null
): boolean {
  if (symbol?.toUpperCase().endsWith(".TA")) return true;
  const upper = exchange?.toUpperCase();
  return upper === "TLV" || upper === "TASE";
}
