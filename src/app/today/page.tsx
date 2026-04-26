import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";
import { getTodayEntries } from "@/lib/entries";
import { getTodayTotals } from "@/lib/totals";
import AddEntry from "./AddEntry";
import DailyTotals from "./DailyTotals";
import EntryCard from "./EntryCard";

export default async function TodayPage() {
  const profile = await getCurrentProfile();

  // Middleware already redirects unauthenticated users; defending in depth.
  if (!profile) redirect("/login");

  // M2 gate: if the user hasn't picked a target mode yet, start onboarding.
  if (!profile.onboarded_at) redirect("/onboarding");

  const [goals, entries, { totals, entryCount }] = await Promise.all([
    getLatestGoals(),
    getTodayEntries(),
    getTodayTotals(),
  ]);
  const modeLabel =
    profile.target_mode === "generic" ? "FDA generic" : "Personalized DRI";

  // History link defaults to yesterday — that's almost always what the
  // user wants when jumping back ("how did I eat yesterday?"). From
  // there prev/next walks further.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getDate()).padStart(2, "0");
  const yesterdayHref = `/history/${y}-${m}-${d}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-zinc-500">
            Targets:{" "}
            <Link
              href="/goals"
              className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              {modeLabel}
            </Link>
            {goals && (
              <>
                {" · "}
                <span className="font-mono">
                  {Math.round(goals.calories_kcal).toLocaleString()} kcal
                </span>
              </>
            )}
          </p>
        </div>
        <nav className="flex gap-2">
          <Link
            href={yesterdayHref}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            History
          </Link>
          <Link
            href="/goals"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Goals
          </Link>
          <Link
            href="/profile"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Profile
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <AddEntry userId={profile.id} />

      {goals && (
        <div className="mt-6">
          <DailyTotals
            totals={totals}
            goals={goals}
            entryCount={entryCount}
          />
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Today&apos;s entries
          {entries.length > 0 && (
            <span className="ml-2 font-normal text-zinc-400">
              ({entries.length})
            </span>
          )}
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            Nothing logged yet today.
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
