import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";

export default async function TodayPage() {
  const profile = await getCurrentProfile();

  // Middleware already redirects unauthenticated users; defending in depth.
  if (!profile) redirect("/login");

  // M2 gate: if the user hasn't picked a target mode yet, start onboarding.
  if (!profile.onboarded_at) redirect("/onboarding");

  const goals = await getLatestGoals();
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

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Your day is empty</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Photo capture lands in M3. Your daily targets are ready to roll
          against once you start logging entries.
        </p>
      </section>

      <footer className="mt-10 text-xs text-zinc-400">
        Milestone 2 — profile &amp; goals wired up. Next up: camera capture.
      </footer>
    </main>
  );
}
