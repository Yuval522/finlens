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

/** quoteTypes that carry no income statement/balance sheet/cash flow/estimates data. */
const NON_FUNDAMENTAL_QUOTE_TYPES = new Set([
  "INDEX",
  "COMMODITY",
  "CURRENCY",
  "CRYPTOCURRENCY",
  "FUTURE", // Yahoo classifies commodities (GC=F, CL=F, SI=F, ...) as FUTURE, not COMMODITY
  // QA fix (live report: ETFs like SPCX crashed the fundamentals fetch
  // entirely — see the quoteSummary .catch() fix in yahoo.ts's
  // getFundamentals() for the root cause). ETFs and mutual funds hold a
  // basket of underlying securities rather than filing their own income
  // statement/balance sheet/cash flow — there's no "Total Revenue" or
  // "Operating Income" for a fund itself, only for the individual
  // companies it holds, so a fundamentals tab strip is never meaningful
  // for these regardless of whether the fetch happens to succeed.
  "ETF",
  "MUTUALFUND",
]);

/**
 * True for ANY asset class that has no fundamentals to show — not just
 * indices, but commodities, currency/forex pairs, crypto, ETFs, and mutual
 * funds too. Broadens isIndexQuote() above (kept as-is for anything still
 * calling it directly) with the same "authoritative quoteType first, exact
 * provider-independent symbol shape as a fallback" pattern already proven
 * for isTaseListing/isIndexQuote:
 *   - "^..."     index            e.g. ^GSPC, ^TA125.TA, ^IXIC
 *   - "...=X"    currency/forex   e.g. EURUSD=X, ILS=X
 *   - "...=F"    futures/commodity e.g. GC=F, CL=F, SI=F
 *   - "XXX-YYY"  crypto pair      e.g. BTC-USD, ETH-USD (hyphen + 3-letter
 *                currency code — deliberately narrow so real hyphenated
 *                equity tickers like BRK-B never false-positive, since "B"
 *                isn't a 3-letter currency code)
 * ETFs and mutual funds have no such provider-independent symbol shape —
 * SPY, QQQ, SPCX are indistinguishable from an ordinary equity ticker by
 * spelling alone — so those two rely entirely on quoteType, same as
 * isTaseListing relies entirely on exchange for OTC-style tickers with no
 * distinguishing suffix.
 */
export function isNonFundamentalQuote(
  symbol: string | undefined | null,
  quoteType: string | undefined | null
): boolean {
  const type = quoteType?.trim().toUpperCase();
  if (type && NON_FUNDAMENTAL_QUOTE_TYPES.has(type)) return true;

  const sym = symbol?.trim().toUpperCase();
  if (!sym) return false;
  if (sym.startsWith("^")) return true;
  if (sym.endsWith("=X") || sym.endsWith("=F")) return true;
  if (/-[A-Z]{3}$/.test(sym)) return true;
  return false;
}

/**
 * Human-readable asset-class phrase for the "Fundamentals Not Available"
 * empty state (see NonFundamentalNotice.tsx) shown wherever
 * isNonFundamentalQuote() is true — explains WHY there's no income
 * statement/balance sheet/cash flow instead of just silently omitting the
 * tabs. Mirrors isNonFundamentalQuote's own "quoteType first, symbol shape
 * as fallback" checks so the two functions never disagree about what a
 * symbol is. Falls back to a generic phrase for any future quoteType this
 * app doesn't have specific copy for yet, so the message never reads as
 * broken even if Yahoo introduces a new asset class.
 */
export function nonFundamentalAssetLabel(
  symbol: string | undefined | null,
  quoteType: string | undefined | null
): string {
  const type = quoteType?.trim().toUpperCase();
  switch (type) {
    case "ETF":
      return "an ETF";
    case "MUTUALFUND":
      return "a mutual fund";
    case "INDEX":
      return "a market index";
    case "CRYPTOCURRENCY":
      return "a cryptocurrency";
    case "CURRENCY":
      return "a currency pair";
    case "COMMODITY":
    case "FUTURE":
      return "a commodity";
  }

  const sym = symbol?.trim().toUpperCase();
  if (sym?.startsWith("^")) return "a market index";
  if (sym?.endsWith("=X")) return "a currency pair";
  if (sym?.endsWith("=F")) return "a commodity";
  if (sym && /-[A-Z]{3}$/.test(sym)) return "a cryptocurrency";
  return "a non-operating security";
}
