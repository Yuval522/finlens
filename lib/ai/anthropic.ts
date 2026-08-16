import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client, cached on globalThis exactly like
 * lib/db/client.ts's getDb() — Next.js dev mode hot-reloads route modules
 * on every save, which would otherwise construct a fresh SDK client (and
 * re-validate the API key) on every edit. Never import this from a "use
 * client" component: it reads a server-only secret.
 *
 * ANTHROPIC_API_KEY is Stox's own app-level credential (billed to this
 * app, not the signed-in user) — distinct from the per-user Finnhub/
 * Polygon/Alpha Vantage keys in lib/db/apiKeys.ts, which are for fetching
 * a *user's own* market data. There is no per-user LLM key: every user's
 * strategy query is parsed through this one app-level key.
 */

declare global {
  // eslint-disable-next-line no-var
  var __finlensAnthropicClient: Anthropic | undefined;
}

export function getAnthropicClient(): Anthropic {
  if (!globalThis.__finlensAnthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set — required for the Natural Language Strategy Builder. " +
          "Create a key at console.anthropic.com and set it in Vercel's Project Settings -> " +
          "Environment Variables (see .env.local.example)."
      );
    }
    globalThis.__finlensAnthropicClient = new Anthropic({ apiKey });
  }
  return globalThis.__finlensAnthropicClient;
}

/**
 * Model used for strategy parsing — fast/cheap tier is plenty for a
 * structured-extraction task like this (see lib/strategy/parse.ts), not a
 * reasoning-heavy one. Deliberately Haiku 4.5, not the older "claude-3-5-haiku"
 * naming: 4.5 is the current lightweight/cost-effective tier this app's
 * models are pinned to (see the other model constants used across this
 * codebase), and there's no reason to pin to a superseded generation for a
 * task this simple — same cost-tier intent, newer/cheaper model.
 */
export const STRATEGY_PARSE_MODEL = "claude-haiku-4-5-20251001";
