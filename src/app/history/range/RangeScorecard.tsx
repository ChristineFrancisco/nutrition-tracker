import type { RangeStats } from "@/lib/totals";

/**
 * Top-of-page scorecard summarising the range. A single rounded card
 * with five vital stats laid out as labeled numbers — designed to be
 * scannable in a second, before the user dives into the per-nutrient
 * sparklines below.
 *
 * Each stat is a label on top, value below. Lays out as a 2-column
 * grid on phones and a 5-column row from `sm` up.
 *
 * Best/worst day are rendered as the "MMM d" portion of the bucket
 * date (e.g. "Apr 22"); the date strings flow through as
 * YYYY-MM-DD which we parse in local-tz so the label always matches
 * the calendar day the user is thinking about.
 */
export default function RangeScorecard({ stats }: { stats: RangeStats }) {
  const hasAnyLogged = stats.daysLogged > 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 sm:gap-y-0 lg:grid-cols-6">
        <Stat
          label="Days logged"
          value={`${stats.daysLogged}/${stats.totalDays}`}
        />
        <Stat
          label="Avg cals/day"
          value={
            hasAnyLogged ? `${stats.avgCalories.toLocaleString()}` : "—"
          }
        />
        <Stat
          label="Calorie target hit"
          value={
            hasAnyLogged ? `${stats.daysHitCalorieTarget} days` : "—"
          }
        />
        <Stat
          label="Longest streak"
          value={
            stats.longestGreenStreak > 0
              ? `${stats.longestGreenStreak} ${
                  stats.longestGreenStreak === 1 ? "day" : "days"
                }`
              : "—"
          }
        />
        <Stat
          label="Best / worst"
          value={
            stats.bestDay && stats.worstDay
              ? `${shortDate(stats.bestDay)} / ${shortDate(stats.worstDay)}`
              : "—"
          }
        />
        <Stat
          label="Over upper limit"
          // Days where any tracked Tolerable Upper Intake Level was
          // crossed. Shown in red when > 0 so the user's eye lands on
          // the chronic-exposure signal even at a glance — single
          // high days are mostly fine, the pattern matters.
          value={
            stats.daysOverUpperLimit > 0
              ? `${stats.daysOverUpperLimit} ${
                  stats.daysOverUpperLimit === 1 ? "day" : "days"
                }`
              : hasAnyLogged
                ? "0 days"
                : "—"
          }
          tone={stats.daysOverUpperLimit > 0 ? "danger" : "neutral"}
        />
      </div>
      <p className="mt-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        A &ldquo;green day&rdquo; hits at least 80% of tracked targets
        without exceeding any ceilings (sodium, sat fat, added sugar).
        Streaks break on days with no entries. Days flagged{" "}
        <span className="font-medium text-red-600 dark:text-red-400">
          over upper limit
        </span>{" "}
        crossed a known-harmful threshold for at least one nutrient
        (e.g. iron, vitamin D) — see plan §15 for the list.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  /** "danger" tints the value red — used for the chronic-exposure
   *  Over-upper-limit stat so non-zero counts pop. Other stats stay
   *  neutral; we deliberately don't color "Calorie target hit" by
   *  count (a low number isn't bad, it's just informational). */
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="px-1 sm:px-3 sm:first:pl-0 sm:last:pr-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-sm tabular-nums sm:text-base ${
          tone === "danger" ? "text-red-700 dark:text-red-300" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** "2026-04-22" → "Apr 22". Local-tz parse so the label matches the
 *  calendar day, not a UTC drift. */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
