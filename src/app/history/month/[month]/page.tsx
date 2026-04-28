import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";
import { formatLocalDateString } from "@/lib/entries";
import {
  getMonthCaloriesByDay,
  pctOf,
  type DayCaloriesCell,
} from "@/lib/totals";
import { computeUpperLimits } from "@/lib/targets/upper_limits";

/**
 * Month heatmap — calendar grid colored by % of calorie target, one
 * cell per day. Plan §7 / M6.
 *
 * Route: /history/month/2026-04
 *
 * Color scale (6 tiers):
 *   0%             neutral  — nothing logged that day
 *   1–39%          very light emerald — very low intake
 *   40–69%         light emerald
 *   70–109%        full emerald — on target
 *   110–139%       amber — over
 *   140%+          deep amber — way over
 *
 * Cells inside the month link to /history/[date] (or /today for today).
 * Cells outside the month are shown dim for visual continuity of the
 * grid but aren't clickable. Future dates in the current month are
 * rendered as muted placeholders — we haven't logged there yet, and
 * there's nothing to see.
 *
 * Goal reference: uses the user's latest goals for the whole month as
 * a simplification. The correct (plan §6) behavior is to color each
 * day by its effective-at-the-time goals, which matters if the user
 * switches target modes mid-month. Revisit once the range view lands
 * and we need per-day effective goals anyway.
 */
export default async function HistoryMonthPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month: monthStr } = await params;
  const monthStart = parseMonthString(monthStr);
  if (!monthStart) notFound();

  const today = startOfLocalDay(new Date());
  const currentMonthStart = startOfLocalMonth(today);
  // Future months: nothing to show.
  if (monthStart.getTime() > currentMonthStart.getTime()) notFound();

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");

  // Pre-compute the UL meta map once and pass it into the month
  // aggregator so each cell gets a hasUpperLimitExcess flag without an
  // extra round-trip per day.
  const upperLimits = computeUpperLimits(profile);
  const [goals, byDay] = await Promise.all([
    getLatestGoals(),
    getMonthCaloriesByDay(monthStart, upperLimits),
  ]);

  const calorieTarget = goals?.calories_kcal ?? 0;

  // Build a 6×7 grid of dates starting from the Sunday on or before
  // the 1st of the month. 42 cells covers every possible month layout.
  const gridCells = buildMonthGrid(monthStart);

  const prevMonth = addMonths(monthStart, -1);
  const nextMonth = addMonths(monthStart, 1);
  const isCurrentMonth = monthStart.getTime() === currentMonthStart.getTime();

  const longMonthLabel = monthStart.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  // Stats roll-up for the header: how many days did we log on, and
  // how many days landed in the on-target band? Simple scorecard to
  // motivate the user without overclaiming.
  const loggedDays = countLoggedDays(byDay);
  const onTargetDays = countOnTargetDays(byDay, calorieTarget);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            History · month
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold">
            {longMonthLabel}
          </h1>
          {calorieTarget > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              {loggedDays} {loggedDays === 1 ? "day" : "days"} logged
              {loggedDays > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {onTargetDays} on target
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <nav className="flex flex-wrap gap-2 sm:shrink-0">
          <Link
            href={`/history/week/${formatLocalDateString(weekAnchorForMonth(monthStart))}`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Week
          </Link>
          <Link
            href="/today"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Today
          </Link>
        </nav>
      </header>

      {/* Prev / next month */}
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link
          href={`/history/month/${formatMonthString(prevMonth)}`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ←{" "}
          {prevMonth.toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          })}
        </Link>
        {isCurrentMonth ? (
          <span className="rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-zinc-400 dark:border-zinc-700">
            Current month
          </span>
        ) : (
          <Link
            href={`/history/month/${formatMonthString(nextMonth)}`}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {nextMonth.toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}{" "}
            →
          </Link>
        )}
      </div>

      {/* Calendar */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Weekday header */}
        <div className="mb-2 grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((cellDate) => (
            <DayCell
              key={cellDate.toISOString()}
              cellDate={cellDate}
              monthStart={monthStart}
              today={today}
              byDay={byDay}
              calorieTarget={calorieTarget}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-[10px] text-zinc-500 dark:border-zinc-800">
          <span className="uppercase tracking-[0.12em]">% of calorie goal</span>
          <div className="flex items-center gap-1.5">
            <LegendSwatch className="bg-zinc-100 dark:bg-zinc-800" label="none" />
            <LegendSwatch
              className="bg-emerald-100 dark:bg-emerald-950"
              label="<40"
            />
            <LegendSwatch
              className="bg-emerald-300 dark:bg-emerald-800"
              label="40–70"
            />
            <LegendSwatch
              className="bg-emerald-500 dark:bg-emerald-600"
              label="70–110"
            />
            <LegendSwatch
              className="bg-amber-400 dark:bg-amber-500"
              label="110–140"
            />
            <LegendSwatch
              className="bg-amber-600 dark:bg-amber-700"
              label=">140"
            />
          </div>
        </div>
      </section>

      <footer className="mt-6 text-xs leading-relaxed text-zinc-400">
        Days with{" "}
        <span aria-hidden className="text-amber-500">
          ⚠
        </span>{" "}
        include at least one low-confidence estimate. A{" "}
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-red-600 align-middle"
        />{" "}
        marks a day that crossed an upper safe intake limit (e.g. iron,
        vitamin D). Tap a day to review.
      </footer>
    </main>
  );
}

// ----- Day cell -----------------------------------------------------------

function DayCell({
  cellDate,
  monthStart,
  today,
  byDay,
  calorieTarget,
}: {
  cellDate: Date;
  monthStart: Date;
  today: Date;
  byDay: Map<string, DayCaloriesCell>;
  calorieTarget: number;
}) {
  const inMonth =
    cellDate.getFullYear() === monthStart.getFullYear() &&
    cellDate.getMonth() === monthStart.getMonth();
  const isToday = cellDate.getTime() === today.getTime();
  const isFuture = cellDate.getTime() > today.getTime();
  const iso = formatLocalDateString(cellDate);
  const cell = byDay.get(iso);
  const pct =
    cell && calorieTarget > 0 ? pctOf(cell.calories, calorieTarget, 1000) : 0;
  const toneClass =
    !inMonth || isFuture
      ? "bg-zinc-50 dark:bg-zinc-950"
      : calorieTone(cell ? pct : null);
  const textClass =
    !inMonth || isFuture
      ? "text-zinc-300 dark:text-zinc-700"
      : toneTextClass(cell ? pct : null);

  const content = (
    <div
      className={`relative aspect-square rounded-lg ${toneClass} ${textClass} p-1.5 transition ${
        isToday ? "ring-2 ring-brand-500" : ""
      }`}
    >
      <div className="text-[11px] font-medium leading-none">
        {cellDate.getDate()}
      </div>
      {cell && (
        <div className="mt-0.5 text-[9px] font-mono leading-tight opacity-80">
          {Math.round(cell.calories).toLocaleString()}
        </div>
      )}
      {cell?.hasLowConfidence && (
        <div
          aria-hidden
          className="absolute right-1 top-1 text-[9px] text-amber-800 dark:text-amber-200"
          title="Includes at least one low-confidence estimate"
        >
          ⚠
        </div>
      )}
      {cell?.hasUpperLimitExcess && (
        // M8: red dot when any tracked Upper Intake Level was crossed.
        // Distinct from the amber ⚠ — UL excess is a safety signal, not
        // a confidence flag. Positioned bottom-right so the two markers
        // don't overlap on a day that has both.
        <div
          aria-hidden
          className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-500"
          title="A nutrient went over its upper safe intake limit"
        />
      )}
    </div>
  );

  if (!inMonth || isFuture) {
    return content;
  }

  // Today's cell points at /today so the canonical URL for "now" is
  // preserved even when entering via the heatmap.
  const href = isToday ? "/today" : `/history/${iso}`;
  return (
    <Link
      href={href}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
      title={`${cellDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}${
        cell
          ? ` — ~${Math.round(cell.calories).toLocaleString()} kcal${
              calorieTarget > 0
                ? ` (${Math.round(
                    (cell.calories / calorieTarget) * 100
                  )}% of goal)`
                : ""
            }`
          : " — nothing logged"
      }`}
    >
      <div className="transition group-hover:brightness-95 dark:group-hover:brightness-110">
        {content}
      </div>
    </Link>
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`}
      />
      {label}
    </span>
  );
}

// ----- Coloring ------------------------------------------------------------

/**
 * 6-tier sequential scale. `null` = no entries (distinct from "logged 0
 * calories", which we never actually hit because an analyzed entry
 * always has > 0 calories from at least one item).
 */
function calorieTone(pct: number | null): string {
  if (pct === null) return "bg-zinc-100 dark:bg-zinc-800";
  if (pct < 40) return "bg-emerald-100 dark:bg-emerald-950";
  if (pct < 70) return "bg-emerald-300 dark:bg-emerald-800";
  if (pct < 110) return "bg-emerald-500 dark:bg-emerald-600";
  if (pct < 140) return "bg-amber-400 dark:bg-amber-500";
  return "bg-amber-600 dark:bg-amber-700";
}

/**
 * Text color that contrasts with the corresponding tone. Light cells
 * take zinc-800 text; saturated cells (emerald-500+ / amber-400+) take
 * white text so the day number and kcal readout stay legible.
 */
function toneTextClass(pct: number | null): string {
  if (pct === null || pct < 70) return "text-zinc-700 dark:text-zinc-100";
  return "text-white";
}

// ----- Grid math -----------------------------------------------------------

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * 42 dates covering the month's calendar grid. Starts on the Sunday on
 * or before the 1st of the month; runs forward 42 days. Days outside
 * the target month are rendered dim by the cell component.
 *
 * 42 always fits: 28-day Feb + worst-case Sunday-start can be covered
 * in 5 rows (35), but most layouts need 6 rows; 42 is the stable
 * upper bound and keeps rendering predictable across months.
 */
function buildMonthGrid(monthStart: Date): Date[] {
  const first = new Date(monthStart);
  const dayOfWeek = first.getDay(); // 0 = Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - dayOfWeek);
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    // Normalize to local-midnight so Date.getTime() comparisons with
    // `today` work cleanly (no off-by-hour issues around DST).
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

function countLoggedDays(byDay: Map<string, DayCaloriesCell>): number {
  let n = 0;
  for (const cell of byDay.values()) {
    if (cell.entryCount > 0) n += 1;
  }
  return n;
}

function countOnTargetDays(
  byDay: Map<string, DayCaloriesCell>,
  target: number
): number {
  if (target <= 0) return 0;
  let n = 0;
  for (const cell of byDay.values()) {
    if (cell.entryCount === 0) continue;
    const pct = (cell.calories / target) * 100;
    if (pct >= 70 && pct < 110) n += 1;
  }
  return n;
}

// ----- Param parsing -------------------------------------------------------

/**
 * Strict YYYY-MM parser. Returns a local-midnight Date on the 1st of
 * the month, or null on malformed input / impossible month.
 */
function parseMonthString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function formatMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

/**
 * The date the Week link should anchor to from a month view: the most
 * recent day in that month that's not in the future. For past months
 * we pick the last day of the month; for the current month we pick
 * today. The week page resolves the actual Mon→Sun window from any
 * date inside it.
 */
function weekAnchorForMonth(monthStart: Date): Date {
  const lastOfMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  );
  const today = startOfLocalDay(new Date());
  return lastOfMonth.getTime() > today.getTime() ? today : lastOfMonth;
}
