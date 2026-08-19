/**
 * Server-computed greeting + US market status line for the Home dashboard
 * header ("Good evening" / "Markets closed • Reopens 9:30 AM EST • Wed, Aug
 * 19"). Deliberately anchored to America/New_York (the exchange's own
 * timezone) rather than the visitor's local time — this is a market-status
 * line, not a personal greeting clock, and anchoring both pieces of text to
 * the same clock keeps them from ever contradicting each other (e.g.
 * "Good morning" printed next to "reopens tonight"). Computed purely
 * server-side from the request-time Date — the Home page already opts into
 * `export const dynamic = "force-dynamic"`, so this re-evaluates on every
 * request — with no client-side recomputation, so there's no
 * hydration-mismatch risk as long as the component calling this stays a
 * plain server component (no "use client", no useEffect re-deriving it).
 *
 * Regular-hours-only approximation: NYSE holidays are NOT accounted for
 * (e.g. this will say "Markets open" on Thanksgiving morning). The actual
 * per-quote `marketState` used elsewhere in the app (see
 * lib/finance/types.ts) comes straight from Yahoo and IS holiday-accurate;
 * this header is a lighter-weight, time-of-week-only heuristic for the
 * summary line specifically.
 */

const ET_TIME_ZONE = "America/New_York";
const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 9:30 AM
const MARKET_CLOSE_MINUTES = 16 * 60; // 4:00 PM

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface EtNow {
  hour: number;
  minute: number;
  weekdayIndex: number; // 0=Sun..6=Sat
  year: number;
  month: number; // 1-12
  day: number;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
}

function getEtNow(date: Date): EtNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekdayIndex: WEEKDAY_SHORT.indexOf(get("weekday")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function formatDateLabel({ year, month, day, weekdayIndex }: CalendarDate): string {
  void year; // not shown in the label (matches the reference design's "Wed, Aug 19")
  return `${WEEKDAY_SHORT[weekdayIndex]}, ${MONTH_SHORT[month - 1]} ${day}`;
}

/**
 * Rolls a Y/M/D forward by `days` calendar days. UTC-anchored (noon, to
 * stay clear of any DST-transition edge) purely as a calendar-math trick —
 * these numbers represent ET calendar days throughout, never converted
 * back to a real instant.
 */
function addCalendarDays(from: Omit<CalendarDate, "weekdayIndex">, days: number): CalendarDate {
  const anchor = new Date(Date.UTC(from.year, from.month - 1, from.day, 12));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
    weekdayIndex: anchor.getUTCDay(),
  };
}

export interface MarketStatusHeaderInfo {
  greeting: "Good morning" | "Good afternoon" | "Good evening";
  isOpen: boolean;
  statusLabel: "Markets open" | "Markets closed";
  statusDetail: string;
  dateLabel: string;
}

export function getMarketStatusHeader(now: Date = new Date()): MarketStatusHeaderInfo {
  const et = getEtNow(now);
  const minutesSinceMidnight = et.hour * 60 + et.minute;
  const isWeekday = et.weekdayIndex >= 1 && et.weekdayIndex <= 5;
  const isOpen =
    isWeekday && minutesSinceMidnight >= MARKET_OPEN_MINUTES && minutesSinceMidnight < MARKET_CLOSE_MINUTES;

  const greeting: MarketStatusHeaderInfo["greeting"] =
    et.hour >= 5 && et.hour < 12 ? "Good morning" : et.hour >= 12 && et.hour < 17 ? "Good afternoon" : "Good evening";

  if (isOpen) {
    return {
      greeting,
      isOpen: true,
      statusLabel: "Markets open",
      statusDetail: "Closes 4:00 PM EST",
      dateLabel: formatDateLabel(et),
    };
  }

  // Find the next open: later today (still before 9:30 AM on a weekday) or
  // the next Mon-Fri after rolling past any weekend in between.
  const reopensToday = isWeekday && minutesSinceMidnight < MARKET_OPEN_MINUTES;
  let next: CalendarDate = et;
  if (!reopensToday) {
    do {
      next = addCalendarDays(next, 1);
    } while (next.weekdayIndex < 1 || next.weekdayIndex > 5);
  }

  return {
    greeting,
    isOpen: false,
    statusLabel: "Markets closed",
    statusDetail: "Reopens 9:30 AM EST",
    dateLabel: formatDateLabel(next),
  };
}
