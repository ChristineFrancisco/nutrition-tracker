import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";
import { getTodayEntries } from "@/lib/entries";
import { computeExcesses, getTodayTotals } from "@/lib/totals";
import { computeUpperLimits } from "@/lib/targets/upper_limits";
import AddEntry from "./AddEntry";
import DailyTotals from "./DailyTotals";
import EntryCard from "./EntryCard";
import UserMenu from "@/components/UserMenu";
import { deriveInitials } from "@/lib/initials";

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

  // ULs are computed deterministically from the profile (calcium has an
  // age band; the rest are flat for adults). We pass the meta map down
  // so the callout can render risk copy + the source caveat for niacin
  // / folic acid / supplemental magnesium.
  const upperLimits = computeUpperLimits(profile);
  const excesses = computeExcesses(totals, upperLimits);

  // Two history entry points:
  //   - Yesterday — one-tap shortcut to the most-frequent target ("how
  //     did I eat yesterday?"); the day view's prev/next then walks
  //     further.
  //   - Month — calendar heatmap for the current month; better for "how
  //     has my week looked overall" or jumping more than a few days back.
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayHref = `/history/${yesterday.getFullYear()}-${String(
    yesterday.getMonth() + 1,
  ).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const monthHref = `/history/month/${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}`;
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Week link: the week containing today.
  const weekHref = `/history/week/${fmt(today)}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href={yesterdayHref}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Yesterday
          </Link>
          <Link
            href={weekHref}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Week
          </Link>
          <Link
            href={monthHref}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Month
          </Link>
          <UserMenu
            initials={deriveInitials(profile.display_name, profile.email)}
            email={profile.email}
            displayName={profile.display_name}
          />
        </nav>
      </header>

      <AddEntry userId={profile.id} />

      {goals && (
        <div className="mt-6">
          <DailyTotals
            totals={totals}
            goals={goals}
            entryCount={entryCount}
            upperLimits={upperLimits}
            excesses={excesses}
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
