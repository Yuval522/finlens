import { TtlCache } from "@/lib/finance/cache";
import type { ParsedStrategy } from "./types";

/**
 * Token-cost cache for the Natural Language Strategy Builder's Claude call
 * (lib/strategy/parse.ts). If a user repeats an identical-after-normalization
 * query, this skips the Anthropic call entirely and returns the previously
 * parsed filter spec.
 *
 * Important scope/honesty note on "semantically similar" (from the original
 * request): this is a NORMALIZED EXACT-MATCH cache, not true semantic
 * similarity via embeddings. `canonicalizeQuery` makes it insensitive to
 * casing, surrounding/repeated whitespace, and trailing punctuation, so
 * "RSI under 30" / "rsi under 30" / "RSI under 30  " / "RSI under 30." all
 * hit the same cache entry — but "RSI below 30" (a genuine paraphrase) will
 * NOT. A real semantic-similarity cache would need either an embeddings
 * model (its own API call and cost — defeats the purpose here) or a local
 * embedding model (a meaningfully heavier dependency than this feature
 * warrants). Normalized exact-match is the correct, honest tradeoff for
 * "eliminate token waste on literal repeats" without silently pretending to
 * understand paraphrases it doesn't.
 *
 * Scoped to this process's memory (see TtlCache's own doc comment) — a
 * repeat query from the same warm serverless instance is a cache hit; one
 * that lands on a different/cold instance is a normal miss and just costs
 * the same Anthropic call it always would have. That's a real limitation of
 * an in-memory cache on serverless, not a bug — a shared cross-instance
 * cache would need Redis or a DB table, which is a meaningfully bigger
 * addition than this feature's token-cost goal justifies on its own.
 */

const QUERY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — a parsed filter spec for the same text is deterministic-enough not to need frequent re-parsing, but not cached forever in case the prompt/model changes.
const QUERY_CACHE_MAX_SIZE = 300;

const parsedStrategyCache = new TtlCache<ParsedStrategy>(QUERY_CACHE_TTL_MS, QUERY_CACHE_MAX_SIZE);

/** Casing/whitespace/punctuation-insensitive cache key. See this module's doc comment for exactly what this does and does NOT normalize. */
export function canonicalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

export function getCachedParsedStrategy(query: string): ParsedStrategy | undefined {
  const cached = parsedStrategyCache.get(canonicalizeQuery(query));
  // Defensive shallow clone (top-level object + the filters array) so a
  // caller can never accidentally mutate the shared cached entry itself —
  // nothing downstream currently mutates a ParsedStrategy in place, but
  // this is cheap insurance against that ever becoming true later without
  // anyone noticing it's corrupting a shared cache entry.
  return cached ? { ...cached, filters: [...cached.filters] } : undefined;
}

export function setCachedParsedStrategy(query: string, parsed: ParsedStrategy): void {
  parsedStrategyCache.set(canonicalizeQuery(query), parsed);
}
