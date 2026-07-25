/**
 * Currency-aware formatting for prices, changes, and market caps.
 *
 * The tricky bit: TASE (Tel Aviv) instruments quote in **agorot** (ILA),
 * 1/100 of a shekel, and UK instruments often quote in **pence** (GBp),
 * 1/100 of a pound — both need dividing down before display. Everything
 * else is already in its base currency unit.
 *
 * Assumption worth flagging: `marketCap` is treated with the same
 * divisor as price (i.e. if the price feed is in agorot, market cap is
 * assumed to be too, since it's derived from price × shares outstanding).
 * This couldn't be verified against a live quote in this environment
 * (see project notes) — spot-check against a real TASE quote before
 * relying on it for anything beyond display.
 */

interface CurrencyMeta {
  symbol: string;
  /** Divide the raw provider value by this to get the display-unit value. */
  divisor: number;
  /** Symbol goes after the number instead of before (e.g. "12.3 kr"). */
  symbolAfter?: boolean;
}

const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { symbol: "$", divisor: 1 },
  ILA: { symbol: "₪", divisor: 100 }, // agorot -> shekels
  ILS: { symbol: "₪", divisor: 1 },
  GBp: { symbol: "£", divisor: 100 }, // pence -> pounds
  GBP: { symbol: "£", divisor: 1 },
  EUR: { symbol: "€", divisor: 1 },
  CAD: { symbol: "C$", divisor: 1 },
  MXN: { symbol: "MX$", divisor: 1 },
  JPY: { symbol: "¥", divisor: 1 },
};

function getCurrencyMeta(currency: string | null | undefined): CurrencyMeta {
  if (currency && CURRENCY_META[currency]) return CURRENCY_META[currency];
  return { symbol: currency ? `${currency} ` : "$", divisor: 1 };
}

function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  });
}

/** e.g. formatPrice(15423, "ILA") -> "₪154.23" */
export function formatPrice(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value == null) return "—";
  const { symbol, divisor, symbolAfter } = getCurrencyMeta(currency);
  const display = formatNumber(value / divisor);
  return symbolAfter ? `${display} ${symbol}` : `${symbol}${display}`;
}

/** e.g. formatChange(-320, "ILA") -> "-₪3.20" */
export function formatChange(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatPrice(Math.abs(value), currency)}`;
}

/** e.g. formatPercent(2.35) -> "+2.35%" (input is already a percentage, not a fraction). */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

/** e.g. formatMarketCap(2_450_000_000_00, "ILA") -> "₪2.45B" */
export function formatMarketCap(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value == null) return "—";
  const { symbol, divisor, symbolAfter } = getCurrencyMeta(currency);
  const display = compact(value / divisor);
  return symbolAfter ? `${display} ${symbol}` : `${symbol}${display}`;
}

/** True if the change is positive/negative/flat — for text-success/text-destructive styling. */
export function changeDirection(
  value: number | null | undefined
): "up" | "down" | "flat" {
  if (value == null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}
