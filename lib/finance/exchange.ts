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

/**
 * QA hotfix (Final Polish pass): TASE search results were still badging as
 * USD live, even though the exchange badge itself correctly showed "TLV".
 * Root cause: currency was guessed purely from Yahoo's raw exchange code
 * on the search result, which is unverified live in this sandbox (network
 * blocked) and evidently doesn't reliably equal "TLV"/"TASE" for every
 * TASE search hit. The symbol suffix (".TA") is a far more reliable
 * signal — it's exact, provider-independent, and already proven correct
 * elsewhere (ChartPanel's locale detection uses the same check). Guess
 * currency from the symbol suffix first, falling back to the exchange-code
 * map only when the symbol itself doesn't disambiguate.
 */
export function guessCurrencyForSearchResult(
  symbol: string | undefined | null,
  exchange: string | undefined | null
): string {
  if (isTaseListing(symbol, exchange)) return "ILA";
  return guessCurrencyFromExchange(exchange);
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

/**
 * True for market indices (e.g. ^GSPC, ^TA125.TA, ^IXIC) — Yahoo's
 * `quoteType: "INDEX"` is the authoritative signal, but the `^` symbol
 * prefix is checked too since it's exact and provider-independent (same
 * defense-in-depth pattern as isTaseListing's symbol-suffix check). Indices
 * have no income statement/balance sheet/cash flow/estimates to show, so
 * callers use this to hide the fundamentals tab strip and render only the
 * header + price chart.
 */
export function isIndexQuote(
  symbol: string | undefined | null,
  quoteType: string | undefined | null
): boolean {
  if (quoteType?.toUpperCase() === "INDEX") return true;
  return Boolean(symbol?.trim().startsWith("^"));
}
