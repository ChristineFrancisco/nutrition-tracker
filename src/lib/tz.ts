/**
 * Timezone-aware boundary math, used by all the date-bucketing helpers
 * (getEntriesForDate, getTotalsForDate, getMonthCaloriesByDay,
 * getRangeData, etc.) so "today" / "this month" / etc. match the
 * user's wall clock rather than the server's.
 *
 * Why this exists: Vercel's Node runtime is in UTC. Without
 * tz-correctness, an entry logged at 9pm Pacific (= 04:00 UTC the
 * next day) falls into the UTC "today" bucket the next morning and
 * misleads the user.
 *
 * No external dependency. Uses Intl.DateTimeFormat with the
 * "longOffset" timeZoneName style to back out the UTC offset for any
 * IANA timezone at any instant — that's the only well-supported way
 * to do tz-aware math without pulling in a date library.
 */

const FALLBACK_TZ = "UTC";

/**
 * Resolve a tz string to a usable IANA tz. Returns "UTC" for
 * null/undefined/empty/invalid input rather than throwing — callers
 * can rely on never getting an exception from this layer.
 */
export function resolveTimeZone(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ;
  try {
    // Intl throws on invalid tz strings; the format result we don't
    // care about, just the validation side effect.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

/**
 * Offset of `tz` from UTC at the given instant, in minutes (positive
 * for tz east of UTC, e.g. "Europe/Berlin" → +60 in winter, +120 in
 * summer). DST-aware because we ask Intl for the offset *at this
 * instant*.
 */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  });
  const parts = dtf.formatToParts(date);
  const offsetStr =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  // Format is "GMT" / "GMT+00:00" / "GMT-08:00" / "GMT+05:30".
  const m = /GMT(?:([+-])(\d{2}):?(\d{2}))?/.exec(offsetStr);
  if (!m || !m[1]) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Get the {year, month, day} of a Date as it reads on the wall clock
 * in `tz`. Independent of the server's local tz.
 */
export function dateInTimeZone(
  date: Date,
  tz: string,
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return { year: Number(y), month: Number(mo), day: Number(d) };
}

/**
 * The UTC instant at which `(year, month, day) 00:00:00.000` happens
 * in `tz`. Compute by:
 *   1. Pretending the local date is also UTC (a "naive" midnight).
 *   2. Asking Intl for tz's offset at that naive instant.
 *   3. Subtracting the offset to get the real UTC instant.
 *
 * Around DST transitions there's a small ambiguity (the "missing
 * hour" / "doubled hour"); we accept whichever the second call to
 * Intl resolves to, which is the standard outcome for this pattern
 * and matches what users see in mainstream calendar apps.
 */
function utcForLocalMidnightInTz(
  year: number,
  month: number,
  day: number,
  tz: string,
): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMin = tzOffsetMinutes(naive, tz);
  return new Date(naive.getTime() - offsetMin * 60 * 1000);
}

/**
 * The UTC instant for the start of `referenceDate`'s calendar day in
 * `tz`. If you call this with `new Date()` and tz="America/Los_Angeles",
 * you get back the UTC timestamp for "today, 00:00 Pacific" — which
 * shifts to a different UTC instant at 8am UTC vs. 7am UTC across DST.
 */
export function startOfDayInTz(referenceDate: Date, tz: string): Date {
  const { year, month, day } = dateInTimeZone(referenceDate, tz);
  return utcForLocalMidnightInTz(year, month, day, tz);
}

/**
 * Exclusive end of the calendar day containing `referenceDate` in
 * `tz` — i.e. the start of the next day. Use as `< end` in queries
 * (matches the existing dayBoundaries convention).
 */
export function endOfDayInTz(referenceDate: Date, tz: string): Date {
  const { year, month, day } = dateInTimeZone(referenceDate, tz);
  return utcForLocalMidnightInTz(year, month, day + 1, tz);
}

/**
 * [start, end) UTC bounds for the calendar day in `tz` that contains
 * `referenceDate`. Drop-in for the old dayBoundaries when the caller
 * has a tz available.
 */
export function dayBoundariesInTz(
  referenceDate: Date,
  tz: string,
): { start: Date; end: Date } {
  return {
    start: startOfDayInTz(referenceDate, tz),
    end: endOfDayInTz(referenceDate, tz),
  };
}

/**
 * [start, end) UTC bounds for the calendar month in `tz` that contains
 * `referenceDate`.
 */
export function monthBoundariesInTz(
  referenceDate: Date,
  tz: string,
): { start: Date; end: Date } {
  const { year, month } = dateInTimeZone(referenceDate, tz);
  return {
    start: utcForLocalMidnightInTz(year, month, 1, tz),
    end: utcForLocalMidnightInTz(year, month + 1, 1, tz),
  };
}

/**
 * Format `date` as YYYY-MM-DD on the wall clock in `tz`. Used as a
 * map key when bucketing entries by day for the month / range views.
 */
export function formatDateInTz(date: Date, tz: string): string {
  const { year, month, day } = dateInTimeZone(date, tz);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
