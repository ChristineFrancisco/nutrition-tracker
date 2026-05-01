import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { formatLocalDateString } from "@/lib/entries";
import { getRangeData, zeroNutrients } from "@/lib/totals";
import type { Nutrients, NutrientKey } from "@/lib/targets/types";
import DailyTotals from "@/app/today/DailyTotals";
import WeekModeToggle from "./WeekModeToggle";
import UserMenu from "@/components/UserMenu";
import { deriveInitials } from "@/lib/initials";

type Mode = "calendar" | "trailing";

/**
 * Week view — `/history/week/2026-04-20`.
 *
 * Same rollup chrome as Today (DailyTotals: calorie ring, macro bars,
 * watch chips, micros disclosure) but with **weekly-scaled goals** and
 * **weekly totals**: targets are the user's daily targets multiplied by
 * 7, and totals are summed across the seven days of the ISO week
 * (Monday → Sunday) containing the URL date.
 *
 * Why Mon→Sun: ISO 8601 standard week. Stable across locales and
 * matches the way "this week" is rendered in calendar UIs that don't
 * mark Sunday as the start.
 *
 * URL canonicalization: any date inside the week resolves to the same
 * Monday and we redirect non-Monday URLs to the canonical one. Keeps
 * bookmarks and prev/next navigation stable.
 *
 * Goals scaling: we use the most-recent goals snapshot in effect by
 * the end of the week and multiply each field × 7. If the user
 * changed goals mid-week the math is slightly inaccurate, but
 * mid-week goal changes are rare and the alternative (per-day
 * snapshot summation) over-engineers the v1.
 *
 * No UL handling: Tolerable Upper Intake Levels are *daily* safety
 * thresholds, not weekly. We deliberately don't pass `upperLimits` /
 * `excesses` to DailyTotals here so the micros bars and the disclosure
 * marker don't fire spurious "over UL" signals against weekly totals.
 * The daily view is the right place to read UL crossings; the
 * per-day strip below this rollup links straight there.
 */
export default async function WeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { date: dateStr } = await params;
  const { mode: modeParam } = await searchParams;
  const mode: Mode = modeParam === "trailing" ? "trailing" : "calendar";

  const anchor = parseLocalDateString(dateStr);
  if (!anchor) notFound();

  const today = startOfLocalDay(new Date());
  const yesterday = addDays(today, -1);

  // Resolve the [start, end] window for the chosen mode.
  //
  //   calendar — Mon→Sun ISO week containing the URL date.
  //   trailing — 7 days ending the URL date (yesterday by default).
  //
  // For calendar mode we also canonicalize the URL to the Monday so
  // prev/next links and bookmarks are stable. Trailing mode treats
  // the URL date as the end-of-window anchor, so we don't redirect.
  let windowStart: Date;
  let windowEnd: Date; // inclusive
  if (mode === "calendar") {
    const monday = mondayOf(anchor);
    const todayMonday = mondayOf(today);
    if (monday.getTime() > todayMonday.getTime()) notFound();
    if (anchor.getTime() !== monday.getTime()) {
      redirect(`/history/week/${formatLocalDateString(monday)}`);
    }
    windowStart = monday;
    windowEnd = addDays(monday, 6);
  } else {
    // Trailing: future end dates aren't allowed. We let "today" pass
    // (some users will land here directly) but show a hint that
    // trailing windows make most sense ending yesterday — the
    // toggle's default link uses yesterday so this is just a safety
    // valve.
    if (anchor.getTime() > today.getTime()) notFound();
    windowStart = addDays(anchor, -6);
    windowEnd = anchor;
  }

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");

  // Clamp to today for the data fetch: a trailing window ending today
  // still asks for today's partial totals, but a calendar window
  // ending Sunday in the current week needs to stop at today.
  const dataEnd =
    windowEnd.getTime() > today.getTime() ? today : windowEnd;
  const data = await getRangeData(windowStart, dataEnd);

  // Weekly totals = sum across buckets. entryCount sums similarly so
  // the "N meals logged" pill in DailyTotals reads weekly.
  const weeklyTotals = zeroNutrients();
  let weeklyEntryCount = 0;
  const allKeys = Object.keys(weeklyTotals) as NutrientKey[];
  for (const b of data.buckets) {
    for (const k of allKeys) {
      weeklyTotals[k] += b.totals[k];
    }
    weeklyEntryCount += b.entryCount;
  }

  // Weekly goals: most-recent goals snapshot in this range × 7.
  const refGoals =
    [...data.buckets].reverse().find((b) => b.goals !== null)?.goals ?? null;
  const weeklyGoals = refGoals ? scaleNutrients(refGoals, 7) : null;

  // Prev / next navigation. Both modes shift by 7 days; the difference
  // is what we anchor on (Monday vs the trailing end). "next" in both
  // modes lands at "today" once we'd cross into a future window.
  const prevAnchor = addDays(anchor, -7);
  const nextAnchor = addDays(anchor, 7);
  const nextIsFuture =
    mode === "calendar"
      ? mondayOf(nextAnchor).getTime() > mondayOf(today).getTime()
      : nextAnchor.getTime() > today.getTime();
  const modeQuery = mode === "trailing" ? "?mode=trailing" : "";

  const longLabel = formatRangeLabel(windowStart, windowEnd);

  // Month link from the week — drops into the calendar for the month
  // the window's start is in (consistent with how the day view links).
  const monthHref = `/history/month/${windowStart.getFullYear()}-${String(
    windowStart.getMonth() + 1,
  ).padStart(2, "0")}`;

  const todayStr = formatLocalDateString(today);
  const yesterdayStr = formatLocalDateString(yesterday);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            History · week
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold">
            {longLabel}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            {mode === "calendar"
              ? "Calendar week (Mon–Sun)"
              : "Trailing 7 days ending " +
                windowEnd.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
            {" · "}
            Targets shown are 7× your daily goals.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Link
            href={monthHref}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Month
          </Link>
          <Link
            href="/today"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Today
          </Link>
          <UserMenu
            initials={deriveInitials(profile.display_name, profile.email)}
            email={profile.email}
            displayName={profile.display_name}
          />
        </nav>
      </header>

      {/* Mode toggle */}
      <div className="mb-4">
        <WeekModeToggle
          mode={mode}
          todayDate={todayStr}
          yesterdayDate={yesterdayStr}
        />
      </div>

      {/* Prev / next week */}
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link
          href={`/history/week/${formatLocalDateString(prevAnchor)}${modeQuery}`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ←{" "}
          {mode === "calendar"
            ? `Week of ${prevAnchor.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}`
            : `Ending ${prevAnchor.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}`}
        </Link>
        <Link
          href={
            nextIsFuture
              ? mode === "calendar"
                ? "/today"
                : `/history/week/${yesterdayStr}?mode=trailing`
              : `/history/week/${formatLocalDateString(nextAnchor)}${modeQuery}`
          }
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {nextIsFuture
            ? mode === "calendar"
              ? "This week"
              : "Latest"
            : mode === "calendar"
              ? `Week of ${nextAnchor.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`
              : `Ending ${nextAnchor.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`}{" "}
          →
        </Link>
      </div>

      {weeklyGoals && (
        <DailyTotals
          totals={weeklyTotals}
          goals={weeklyGoals}
          entryCount={weeklyEntryCount}
          heading={
            mode === "calendar" ? "This week" : "Trailing 7 days"
          }
          emptyHint={
            mode === "calendar"
              ? "Nothing was logged in this calendar week."
              : "Nothing was logged in this 7-day window."
          }
          countNoun="entry"
          countNounPlural="entries"
        />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Days
        </h2>
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {data.buckets.map((b) => {
            const dailyTarget = b.goals?.calories_kcal ?? 0;
            const ratio = dailyTarget > 0 ? b.totals.calories_kcal / dailyTarget : 0;
            const onTarget = ratio >= 0.8 && ratio <= 1.2;
            return (
              <li
                key={b.date}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <Link
                  href={`/history/${b.date}`}
                  className="flex min-w-0 items-baseline gap-2 truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  <span className="truncate">{formatBucketLabel(b.date)}</span>
                  {b.hasUpperLimitExcess && (
                    <span
                      aria-hidden
                      title="A nutrient went over its upper safe intake limit"
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-600 dark:bg-red-500"
                    />
                  )}
                </Link>
                <div className="flex shrink-0 items-baseline gap-3 text-right">
                  <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {b.entryCount === 0
                      ? "—"
                      : `${Math.round(b.totals.calories_kcal).toLocaleString()} kcal`}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-400">
                    {b.entryCount === 0
                      ? ""
                      : `${b.entryCount} ${
                          b.entryCount === 1 ? "entry" : "entries"
                        }`}
                  </span>
                  {b.entryCount > 0 && (
                    <span
                      className={
                        onTarget
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
                          : "rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      }
                    >
                      {onTarget ? "on target" : "off"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="mt-10 text-xs text-zinc-400">
        Values are AI estimates. Tap any day to review and refine its
        entries. Upper-limit warnings are evaluated per day — see the
        red dot on the rows above for days that crossed a UL.
      </footer>
    </main>
  );
}

// ----- Helpers -------------------------------------------------------------

/**
 * The Monday of the ISO week containing `d`. JS getDay() returns 0 for
 * Sunday and 1–6 for Mon–Sat; for Sunday we step back six days, for
 * any other day we step back to the Monday at offset (1 - getDay()).
 */
function mondayOf(d: Date): Date {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(out.getDate() + offset);
  out.setHours(0, 0, 0, 0);
  return out;
}

function parseLocalDateString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const out = new Date(y, mo - 1, d);
  if (
    out.getFullYear() !== y ||
    out.getMonth() !== mo - 1 ||
    out.getDate() !== d
  ) {
    return null;
  }
  return out;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Element-wise multiply each Nutrients field by `n`. Used to scale
 *  the daily-goal snapshot up to a weekly target. */
function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = { ...n } as Nutrients;
  const keys = Object.keys(out) as NutrientKey[];
  for (const k of keys) out[k] = n[k] * factor;
  return out;
}

function formatRangeLabel(monday: Date, sunday: Date): string {
  const sameMonth =
    monday.getMonth() === sunday.getMonth() &&
    monday.getFullYear() === sunday.getFullYear();
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const fromStr = monday.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toStr = sunday.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fromStr} — ${toStr}`;
}

function formatBucketLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
