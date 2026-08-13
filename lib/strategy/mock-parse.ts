import { MAX_FILTERS, type ParsedStrategy, type StrategyFilter, type StrategyMetric } from "./types";

/**
 * Offline fallback for the Natural Language Strategy Builder
 * (lib/strategy/parse.ts) when ANTHROPIC_API_KEY isn't configured at
 * all. Rather than fail every request outright, this does a best-effort
 * keyword/pattern match over the SAME closed vocabulary the real
 * Claude-powered parser is constrained to (STRATEGY_METRICS/
 * STRATEGY_OPERATORS, lib/strategy/types.ts) — so the rest of the
 * Strategy Builder (execution engine, results table, "generated
 * filtering logic" transparency panel) can be exercised end-to-end
 * without a live API key.
 *
 * Explicitly NOT a substitute for real natural-language understanding —
 * it's ordered regex matching over common English/Hebrew screening
 * phrasing, nothing more. It will miss phrasing it doesn't recognize
 * (returning `unsupported: true` rather than guessing), and Hebrew
 * support in particular is limited to a handful of common finance
 * phrases (see HEBREW_PHRASE_MAP below), unlike the real parser's
 * genuine free-form Hebrew understanding. Every result is tagged
 * `mock: true` so the UI can disclose this honestly rather than let a
 * simplified keyword match pass as genuine AI parsing.
 */

const GT_WORDS = "over|above|greater than|more than|higher than|at least|north of|exceeding|bigger than";
const LT_WORDS = "under|below|less than|lower than|at most|cheaper than|south of|smaller than";
// Longest/most-specific alternatives first so e.g. "billion" doesn't get
// cut short by a bare "b" alternative matching first.
const NUM_PATTERN = "\\$?\\s*(\\d+(?:\\.\\d+)?)\\s*(billion|trillion|thousand|million|bn|tn|mn|k|b|m|t)?\\b";

const MARKET_CAP_METRIC = "market\\s*cap(?:italization)?|\\bcap\\b";
const PE_METRIC = "p\\/?e\\s*ratio|p\\/?e\\b|price[\\s-]*to[\\s-]*earnings";
const DIVIDEND_METRIC = "dividend\\s*yield|dividend\\b";
const VOLUME_METRIC = "volume|shares?(?:\\s*traded)?";
const RSI_METRIC = "rsi(?:[\\s-]*14)?";
const PRICE_METRIC = "share\\s*price|stock\\s*price|\\bprice\\b";

function unitMultiplier(unit?: string): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === "k" || u.startsWith("thousand")) return 1e3;
  if (u.startsWith("t")) return 1e12; // trillion / tn / t (checked after "thousand" above)
  if (u.startsWith("b")) return 1e9; // billion / bn / b
  if (u.startsWith("m")) return 1e6; // million / mn / m
  return 1;
}

function formatMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  return `$${v}`;
}
function formatPlain(v: number): string {
  return String(v);
}
function formatPercent(v: number): string {
  return `${v}%`;
}

interface DirectionalMatch {
  operator: "gt" | "lt";
  value: number;
  index: number;
  length: number;
}

/**
 * Finds a directional value for a metric in either word order — "under
 * 20 P/E" (direction-number-metric) or "P/E under 20"
 * (metric-direction-number) — since both are common phrasings. Returns
 * the earliest match in the text if both patterns happen to match
 * (e.g. the metric word appears twice).
 */
function findDirectionalValue(text: string, metricPattern: string): DirectionalMatch | null {
  const dirGroup = `(${GT_WORDS}|${LT_WORDS})`;
  const beforeRe = new RegExp(`${dirGroup}\\s*${NUM_PATTERN}(?:\\s+\\w+){0,3}?\\s*(?:${metricPattern})`, "i");
  const afterRe = new RegExp(`(?:${metricPattern})(?:\\s+\\w+){0,3}?\\s*${dirGroup}\\s*${NUM_PATTERN}`, "i");

  const beforeMatch = beforeRe.exec(text);
  const afterMatch = afterRe.exec(text);

  const m = beforeMatch && (!afterMatch || beforeMatch.index <= afterMatch.index) ? beforeMatch : afterMatch;
  if (!m) return null;

  const dirWord = m[1].toLowerCase();
  const isGt = new RegExp(`^(?:${GT_WORDS})$`, "i").test(dirWord);
  const value = parseFloat(m[2]) * unitMultiplier(m[3]);
  if (!Number.isFinite(value)) return null;
  return { operator: isGt ? "gt" : "lt", value, index: m.index, length: m[0].length };
}

/** Blanks out a matched span (same length, spaces) so a later, broader pattern can't re-match the same text — e.g. so "price" inside an already-consumed "price to earnings" phrase doesn't also register as a plain `price` filter. */
function consume(text: string, index: number, length: number): string {
  return text.slice(0, index) + " ".repeat(length) + text.slice(index + length);
}

const SMA_ABOVE_RE = (days: 50 | 200) =>
  new RegExp(
    `(above|over)\\s*(?:its\\s*|their\\s*|the\\s*)?(?:(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:over|above)?\\s*)?(?:its\\s*|their\\s*|the\\s*)?${days}[\\s-]*day\\s*(?:sma|moving\\s*average|average|ma)\\b`,
    "i"
  );
const SMA_BELOW_RE = (days: 50 | 200) =>
  new RegExp(
    `(below|under)\\s*(?:its\\s*|their\\s*|the\\s*)?(?:(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:under|below)?\\s*)?(?:its\\s*|their\\s*|the\\s*)?${days}[\\s-]*day\\s*(?:sma|moving\\s*average|average|ma)\\b`,
    "i"
  );

const SECTOR_KEYWORDS: [RegExp, string][] = [
  [/\btech(?:nology)?\b/i, "technology"],
  [/\bfinancial|\bbank(?:ing)?\b/i, "financial"],
  [/\bhealthcare|\bhealth\b|\bpharma(?:ceutical)?\b|\bbiotech\b/i, "healthcare"],
  [/\bconsumer\b|\bretail\b/i, "consumer"],
  [/\bindustrial/i, "industrials"],
  [/\benergy\b|\boil\b/i, "energy"],
  [/\bmaterials?\b/i, "materials"],
  [/\butilit(?:y|ies)\b/i, "utilities"],
  [/\breal estate\b|\breit\b/i, "real estate"],
  [/\bcommunication|\btelecom|\bmedia\b/i, "communication services"],
];

/** Best-effort Hebrew -> English phrase substitution for a handful of common screening phrases, applied before the (English-pattern) extraction pipeline runs. Deliberately narrow — see this module's doc comment. */
const HEBREW_PHRASE_MAP: [RegExp, string][] = [
  [/שווי\s*שוק/g, "market cap"],
  [/מיליארד\s*דולר|מיליארד/g, "billion"],
  [/מיליון/g, "million"],
  [/מעל\s*ל?/g, "over "],
  [/מתחת\s*ל?|פחות\s*מ/g, "under "],
  [/יותר\s*מ/g, "over "],
  [/ש?עלו\s*היום|עולות\s*היום/g, "up today"],
  [/ש?ירדו\s*היום|יורדות\s*היום/g, "down today"],
  [/תשואת\s*דיבידנד|דיבידנד/g, "dividend yield"],
  [/מכפיל\s*רווח/g, "p/e"],
  [/נפח\s*מסחר/g, "volume"],
];

function normalizeHebrewPhrases(text: string): string {
  let out = text;
  for (const [re, replacement] of HEBREW_PHRASE_MAP) out = out.replace(re, replacement);
  return out;
}

function extractSort(text: string): { sortBy: StrategyMetric | null; sortDirection: "asc" | "desc" | null } {
  const metricMap: [RegExp, StrategyMetric][] = [
    [/market\s*cap/i, "marketCap"],
    [/dividend/i, "dividendYieldPercent"],
    [/p\/?e\b|price[\s-]*to[\s-]*earnings/i, "peRatio"],
    [/rsi/i, "rsi14"],
    [/volume/i, "volume"],
    [/change/i, "changePercent"],
    [/price/i, "price"],
  ];

  let phrase: string | null = null;
  let direction: "asc" | "desc" = "desc";

  const sortedByMatch = /sort(?:ed)?\s*by\s*([a-z\/\s]+)/i.exec(text);
  const highestFirstMatch = /highest\s*([a-z\/\s]+?)\s*first/i.exec(text);
  const lowestFirstMatch = /(?:lowest|cheapest|smallest)\s*([a-z\/\s]+?)\s*first/i.exec(text);

  if (sortedByMatch) {
    phrase = sortedByMatch[1];
  } else if (highestFirstMatch) {
    phrase = highestFirstMatch[1];
    direction = "desc";
  } else if (lowestFirstMatch) {
    phrase = lowestFirstMatch[1];
    direction = "asc";
  } else if (/\bcheapest\b/i.test(text) && /p\/?e|price/i.test(text)) {
    phrase = "p/e";
    direction = "asc";
  }

  if (!phrase) return { sortBy: null, sortDirection: null };
  for (const [re, metric] of metricMap) {
    if (re.test(phrase)) return { sortBy: metric, sortDirection: direction };
  }
  return { sortBy: null, sortDirection: null };
}

function extractLimit(text: string): number | null {
  const m = /\b(?:top|best|give me|show me)\s*(\d{1,3})\b/i.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(100, n);
}

export function parseStrategyMock(query: string): ParsedStrategy {
  let text = normalizeHebrewPhrases(query).toLowerCase();
  const filters: StrategyFilter[] = [];
  const matched: string[] = [];
  const notes: string[] = [];

  function tryDirectional(metric: StrategyMetric, metricPattern: string, label: string, fmt: (v: number) => string) {
    if (filters.some((f) => f.metric === metric)) return;
    const found = findDirectionalValue(text, metricPattern);
    if (!found) return;
    filters.push({ metric, operator: found.operator, value: found.value });
    matched.push(`${label} ${found.operator === "gt" ? "above" : "below"} ${fmt(found.value)}`);
    text = consume(text, found.index, found.length);
  }

  // Order matters: more specific / narrower patterns first so their
  // matched text gets blanked out before broader patterns (like plain
  // "price") get a chance to re-match the same words.
  tryDirectional("marketCap", MARKET_CAP_METRIC, "market cap", formatMoney);
  tryDirectional("peRatio", PE_METRIC, "P/E", formatPlain);
  tryDirectional("dividendYieldPercent", DIVIDEND_METRIC, "dividend yield", formatPercent);
  tryDirectional("rsi14", RSI_METRIC, "RSI", formatPlain);
  tryDirectional("volume", VOLUME_METRIC, "volume", formatPlain);

  // Named market-cap categories (no explicit number given) — only applied if no explicit numeric market cap filter was already found above.
  if (!filters.some((f) => f.metric === "marketCap")) {
    const megaMatch = /\bmega[\s-]?cap\b/i.exec(text);
    const largeMatch = /\blarge[\s-]?cap\b/i.exec(text);
    const midMatch = /\bmid[\s-]?cap\b/i.exec(text);
    const smallMatch = /\bsmall[\s-]?cap\b/i.exec(text);
    if (megaMatch) {
      filters.push({ metric: "marketCap", operator: "gt", value: 200e9 });
      matched.push("mega-cap (market cap over $200B)");
      text = consume(text, megaMatch.index, megaMatch[0].length);
    } else if (largeMatch) {
      filters.push({ metric: "marketCap", operator: "gt", value: 10e9 });
      matched.push("large-cap (market cap over $10B)");
      text = consume(text, largeMatch.index, largeMatch[0].length);
    } else if (midMatch) {
      filters.push({ metric: "marketCap", operator: "gte", value: 2e9 });
      filters.push({ metric: "marketCap", operator: "lte", value: 10e9 });
      matched.push("mid-cap (market cap $2B–$10B)");
      text = consume(text, midMatch.index, midMatch[0].length);
    } else if (smallMatch) {
      filters.push({ metric: "marketCap", operator: "lt", value: 2e9 });
      matched.push("small-cap (market cap under $2B)");
      text = consume(text, smallMatch.index, smallMatch[0].length);
    }
  }

  // Named RSI categories (oversold/overbought) — only if no explicit RSI number was already found above.
  if (!filters.some((f) => f.metric === "rsi14")) {
    const oversoldMatch = /\boversold\b/i.exec(text);
    const overboughtMatch = /\boverbought\b/i.exec(text);
    if (oversoldMatch) {
      filters.push({ metric: "rsi14", operator: "lt", value: 30 });
      matched.push("RSI below 30 (oversold)");
      text = consume(text, oversoldMatch.index, oversoldMatch[0].length);
    } else if (overboughtMatch) {
      filters.push({ metric: "rsi14", operator: "gt", value: 70 });
      matched.push("RSI above 70 (overbought)");
      text = consume(text, overboughtMatch.index, overboughtMatch[0].length);
    }
  }

  // Price vs. 50/200-day moving average.
  for (const [days, metric] of [
    [50, "priceVsSma50"],
    [200, "priceVsSma200"],
  ] as const) {
    const aboveMatch = SMA_ABOVE_RE(days).exec(text);
    const belowMatch = SMA_BELOW_RE(days).exec(text);
    const m = aboveMatch && (!belowMatch || aboveMatch.index <= belowMatch.index) ? aboveMatch : belowMatch;
    if (!m) continue;
    const isAbove = m === aboveMatch;
    const pct = m[2] ? parseFloat(m[2]) : 0;
    filters.push({ metric, operator: isAbove ? "gt" : "lt", value: isAbove ? pct : -pct });
    matched.push(`${isAbove ? "above" : "below"} its ${days}-day average${m[2] ? ` by ${pct}%` : ""}`);
    text = consume(text, m.index, m[0].length);
  }

  // Today's % change.
  if (!filters.some((f) => f.metric === "changePercent")) {
    const upPct = /(?:up|gained|rose|rallied|climbed)\s*(?:by\s*|more than\s*|over\s*)?(\d+(?:\.\d+)?)\s*%/i.exec(text);
    const downPct = /(?:down|dropped|fell|declined|lost)\s*(?:by\s*|more than\s*|over\s*)?(\d+(?:\.\d+)?)\s*%/i.exec(text);
    const upNoNum = /\b(?:up|gained|rose|rallied|climbed)\b/i.exec(text);
    const downNoNum = /\b(?:down|dropped|fell|declined|lost)\b/i.exec(text);
    if (upPct) {
      filters.push({ metric: "changePercent", operator: "gt", value: parseFloat(upPct[1]) });
      matched.push(`up more than ${upPct[1]}% today`);
      text = consume(text, upPct.index, upPct[0].length);
    } else if (downPct) {
      filters.push({ metric: "changePercent", operator: "lt", value: -parseFloat(downPct[1]) });
      matched.push(`down more than ${downPct[1]}% today`);
      text = consume(text, downPct.index, downPct[0].length);
    } else if (upNoNum) {
      filters.push({ metric: "changePercent", operator: "gt", value: 0 });
      matched.push("up today (positive change)");
      text = consume(text, upNoNum.index, upNoNum[0].length);
    } else if (downNoNum) {
      filters.push({ metric: "changePercent", operator: "lt", value: 0 });
      matched.push("down today (negative change)");
      text = consume(text, downNoNum.index, downNoNum[0].length);
    }
  }

  // Plain price — checked last so "P/E"/"price to earnings" has already been consumed above and can't collide with it.
  tryDirectional("price", PRICE_METRIC, "price", formatMoney);

  for (const [re, label] of SECTOR_KEYWORDS) {
    if (re.test(text)) {
      notes.push(`Sector/category filtering ("${label}") isn't supported by any metric here — showing results across all sectors.`);
      break; // one note is enough; avoid stacking near-duplicate notes for multi-sector mentions
    }
  }

  const sort = extractSort(text);
  const limit = extractLimit(text);
  const cappedFilters = filters.slice(0, MAX_FILTERS);
  const unsupported = cappedFilters.length === 0 && !sort.sortBy;

  const parts: string[] = [];
  if (matched.length > 0) parts.push(`Matched: ${matched.join(", ")}.`);
  if (sort.sortBy) parts.push(`Sorted by ${sort.sortBy} (${sort.sortDirection}).`);
  if (limit != null) parts.push(`Limited to top ${limit}.`);
  if (notes.length > 0) parts.push(notes.join(" "));
  if (parts.length === 0) {
    parts.push(
      'Couldn\'t match any supported filter keywords in offline demo mode. Try mentioning a specific metric: market cap, P/E, dividend yield, RSI, volume, price, or moving averages (e.g. "P/E under 20", "RSI below 30", "market cap over 50 billion").'
    );
  }

  return {
    filters: cappedFilters,
    sortBy: sort.sortBy,
    sortDirection: sort.sortDirection,
    limit,
    explanation: `[Offline demo mode — matched by local keyword parsing, not Claude] ${parts.join(" ")}`,
    unsupported,
    mock: true,
  };
}
