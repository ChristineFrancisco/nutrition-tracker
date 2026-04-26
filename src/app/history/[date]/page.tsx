import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getCurrentProfile,
  getGoalsEffectiveOn,
} from "@/lib/profile";
import { formatLocalDateString, getEntriesForDate } from "@/lib/entries";
import { getTotalsForDate } from "@/lib/totals";
import AddEntry from "@/app/today/AddEntry";
import DailyTotals from "@/app/today/DailyTotals";
import EntryCard from "@/app/today/EntryCard";

/**
 * Historical day view — same layout as Today but without the capture
 * form. Keeps DailyTotals / EntryCard intact so the visual language is
 * identical; only the data source and chrome differ.
 *
 * Route: /history/2026-04-22
 *
 * We validate the date param as a strict YYYY-MM-DD local calendar date.
 * - Invalid format or not-a-real-date → 404.
 * - Future date → 404 (no forward-dated log-ahead in v1).
 * - Today's date → redirect to /today so "today" has one canonical URL.
 *
 * Goals are looked up *as of that day* via getGoalsEffectiveOn, not
 * the latest snapshot, so past totals aren't retroactively re-measured
 * against targets that didn't exist yet.
 */
export default async function HistoryDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateStr } = await params;
  const day = parseLocalDateString(dateStr);
  if (!day) notFound();

  const today = startOfLocalDay(new Date());
  if (day.getTime() > today.getTime()) notFound();
  if (day.getTime() === today.getTime()) redirect("/today");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");

  const [goals, entries, { totals, entryCount }] = await Promise.all([
    getGoalsEffectiveOn(day),
    getEntriesForDate(day),
    getTotalsForDate(day),
  ]);

  const prevDay = addDays(day, -1);
  const nextDay = addDays(day, 1);
  const nextIsToday = nextDay.getTime() === today.getTime();

  const longDateLabel = day.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Month view link — pivots to the calendar for the month this day is in.
  const monthHref = `/history/month/${day.getFullYear()}-${String(
    day.getMonth() + 1
  ).padStart(2, "0")}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            History
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold">
            {longDateLabel}
          </h1>
        </div>
        <nav className="flex shrink-0 gap-2">
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

      {/* Prev / next day nav */}
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link
          href={`/history/${formatLocalDateString(prevDay)}`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← {prevDay.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Link>
        <Link
          href={nextIsToday ? "/today" : `/history/${formatLocalDateString(nextDay)}`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {nextIsToday
            ? "Today"
            : nextDay.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
          →
        </Link>
      </div>

      <div className="mb-6">
        <AddEntry userId={profile.id} eatenAtDate={dateStr} />
      </div>

      {goals && (
        <DailyTotals totals={totals} goals={goals} entryCount={entryCount} />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Entries
          {entries.length > 0 && (
            <span className="ml-2 font-normal text-zinc-400">
              ({entries.length})
            </span>
          )}
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            Nothing logged on this day.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} goals={goals} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 text-xs text-zinc-400">
        Values are AI estimates — tap any entry to review and refine.
      </footer>
    </main>
  );
}

/**
 * Parse a strict YYYY-MM-DD string into a local-midnight Date. Returns
 * null on malformed input or an impossible date (e.g. Feb 30).
 *
 * We construct with `new Date(y, m-1, d)` rather than `new Date(str)` so
 * the result is local midnight, matching how dayBoundaries treats
 * "today" — otherwise a tz-aware UTC parse would drift us into the
 * wrong calendar day.
 */
function parseLocalDateString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  // Reject roll-overs like 2026-02-30 (which would resolve to March 2).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
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
