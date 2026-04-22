import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";
import { getTodayEntries, type EntryRow } from "@/lib/entries";
import CaptureForm from "./CaptureForm";
import DeleteEntryButton from "./DeleteEntryButton";

export default async function TodayPage() {
  const profile = await getCurrentProfile();

  // Middleware already redirects unauthenticated users; defending in depth.
  if (!profile) redirect("/login");

  // M2 gate: if the user hasn't picked a target mode yet, start onboarding.
  if (!profile.onboarded_at) redirect("/onboarding");

  const [goals, entries] = await Promise.all([
    getLatestGoals(),
    getTodayEntries(),
  ]);
  const modeLabel =
    profile.target_mode === "generic" ? "FDA generic" : "Personalized DRI";

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

      <CaptureForm userId={profile.id} />

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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 text-xs text-zinc-400">
        AI nutrition analysis lands in the next milestone — for now, each
        photo saves as a &ldquo;pending&rdquo; entry.
      </footer>
    </main>
  );
}

function EntryCard({ entry }: { entry: EntryRow }) {
  const timeLabel = new Date(entry.eaten_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-950">
        {entry.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.photo_url}
            alt={entry.user_note ?? "Meal photo"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            photo expired
          </div>
        )}
      </div>

      <div className="space-y-1 p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-zinc-500">{timeLabel}</span>
          <StatusBadge status={entry.status} />
        </div>
        {entry.status === "rejected" && entry.rejection_reason && (
          <p className="line-clamp-2 text-zinc-500 dark:text-zinc-400">
            {entry.rejection_reason}
          </p>
        )}
        {entry.photo_expires_at && entry.photo_url && (
          <p className="text-[10px] text-zinc-400">
            {expiresInLabel(entry.photo_expires_at)}
          </p>
        )}
        {entry.user_note && (
          <p className="line-clamp-2 text-zinc-600 dark:text-zinc-300">
            {entry.user_note}
          </p>
        )}
      </div>

      <DeleteEntryButton entryId={entry.id} />
    </li>
  );
}

function StatusBadge({ status }: { status: EntryRow["status"] }) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
        Analyzing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200">
        Failed
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
        Not food
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
      Analyzed
    </span>
  );
}

function expiresInLabel(isoExpiresAt: string): string {
  const ms = new Date(isoExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "photo expiring";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `photo will be removed in ${days}d ${hours}h`;
  if (hours > 0) return `photo will be removed in ${hours}h ${minutes}m`;
  return `photo will be removed in ${minutes}m`;
}
