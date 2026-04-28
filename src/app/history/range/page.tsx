import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { computeRangeStats, getRangeData } from "@/lib/totals";
import { computeUpperLimits } from "@/lib/targets/upper_limits";
import { formatLocalDateString } from "@/lib/entries";
import RangeDatePicker from "./RangeDatePicker";
import RangeScorecard from "./RangeScorecard";
import NutrientTrend from "./NutrientTrend";
import type { NutrientKey } from "@/lib/targets/types";

/**
 * Range view — `/history/range?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 *
 * Server component. Reads the from/to query params, validates them (or
 * coerces to a sensible default), then queries `getRangeData` for the
 * per-day buckets and `computeRangeStats` for the headline numbers.
 *
 * Validation rules:
 *   - Missing / malformed from or to → default to last 7 days ending
 *     today.
 *   - Future dates → clamp to today.
 *   - from > to → swap them so the URL the user arrived from still
 *     produces a useful page rather than a 404.
 *   - Range > 90 days → clamp `from` to (to - 89 days). Anything bigger
 *     would balloon the query and make the sparklines unreadable;
 *     90 days is enough for "last quarter" reads.
 *
 * The headline trend sparklines are deliberately limited to six
 * macro-ish nutrients — calories, protein, carbs, fat, sodium, fiber.
 * Surfacing 32 sparklines would obliterate the at-a-glance read; the
 * deeper micro-nutrient story belongs in the per-day view.
 */
export default async function RangePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");

  const params = await searchParams;
  const { from, to } = resolveRange(params.from, params.to);
  const fromStr = formatLocalDateString(from);
  const toStr = formatLocalDateString(to);

  // ULs are computed from the profile (calcium has an age band, the
  // rest are flat for adults). Threading these into getRangeData lets
  // each bucket compute hasUpperLimitExcess in the same single pass it
  // already does for entries — no extra query.
  const upperLimits = computeUpperLimits(profile);
  const data = await getRangeData(from, to, upperLimits);
  const stats = computeRangeStats(data);

  const dayCount = data.buckets.length;
  const longLabel = formatRangeLabel(from, to);

  // Quick-link to the calendar month containing `to`. Lets the user
  // pivot from "what trend over 30 days" to "let me see the actual
  // calendar."
  const monthHref = `/history/month/${to.getFullYear()}-${String(
    to.getMonth() + 1,
  ).padStart(2, "0")}`;

  // The nutrient trends to render. Order matters — the most-watched
  // first so the user's eye lands on calories before niacin.
  const TREND_KEYS: NutrientKey[] = [
    "calories_kcal",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sodium_mg",
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            History · range
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold">
            {longLabel}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            {dayCount} {dayCount === 1 ? "day" : "days"}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 sm:shrink-0">
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
        </nav>
      </header>

      <div className="mb-6">
        <RangeDatePicker from={fromStr} to={toStr} />
      </div>

      <div className="mb-6">
        <RangeScorecard stats={stats} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Trends
        </h2>
        {stats.daysLogged === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            Nothing logged in this range.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white px-4 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {TREND_KEYS.map((k) => (
              <NutrientTrend key={k} k={k} buckets={data.buckets} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Per-day breakdown
        </h2>
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {data.buckets.map((b) => {
            const target = b.goals?.calories_kcal ?? 0;
            const ratio =
              target > 0 ? b.totals.calories_kcal / target : 0;
            const onTarget = ratio >= 0.8 && ratio <= 1.2;
            const dateLabel = formatBucketLabel(b.date);
            return (
              <li
                key={b.date}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <Link
                  href={`/history/${b.date}`}
                  className="flex min-w-0 items-baseline gap-2 truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  <span className="truncate">{dateLabel}</span>
                  {b.hasUpperLimitExcess && (
                    // Mirror of the month-calendar UL dot. Inline with
                    // the date so the user reads "this day in particular
                    // crossed an upper safe limit" without having to
                    // scan a separate column.
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
                      : `${Math.round(
                          b.totals.calories_kcal,
                        ).toLocaleString()} kcal`}
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
        Values are AI estimates — tap any day to review and refine.
      </footer>
    </main>
  );
}

/**
 * Resolve the from/to query params into a normalized [Date, Date] pair.
 * Defaults, clamps, and swaps as needed — see the page's docstring for
 * the rules. Always returns a usable pair so the page never 404s on
 * a bad URL; we'd rather render the default range and let the user
 * re-pick than fail.
 */
function resolveRange(
  fromQ: string | undefined,
  toQ: string | undefined,
): { from: Date; to: Date } {
  const today = startOfLocalDay(new Date());
  const parsedFrom = fromQ ? parseLocalDateString(fromQ) : null;
  const parsedTo = toQ ? parseLocalDateString(toQ) : null;

  let to = parsedTo ?? today;
  if (to.getTime() > today.getTime()) to = today;

  let from: Date;
  if (parsedFrom) {
    from = parsedFrom;
    if (from.getTime() > today.getTime()) from = today;
  } else {
    from = new Date(to);
    from.setDate(from.getDate() - 6); // 7 days ending `to`, inclusive
  }

  if (from.getTime() > to.getTime()) {
    [from, to] = [to, from];
  }

  // Cap at 90 days inclusive. Clamp `from`, not `to`, so the most
  // recent activity stays visible even if the URL asked for too much.
  const ninetyDaysAgo = new Date(to);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
  if (from.getTime() < ninetyDaysAgo.getTime()) from = ninetyDaysAgo;

  return { from, to };
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

function formatRangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromStr = from.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const toStr = to.toLocaleDateString(undefined, {
    month: "short",
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
