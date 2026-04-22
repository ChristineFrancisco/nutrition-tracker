import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated users, but we defend in
  // depth here — nothing on this page should render without a user.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-zinc-500">
            Signed in as <span className="font-mono">{user.email}</span>
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-medium">Your day is empty</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Photo capture lands in M3. For now, this is the protected dashboard
          that confirms auth is working end-to-end.
        </p>
      </section>

      <footer className="mt-10 text-xs text-zinc-400">
        Milestone 1 — scaffolding complete. Next up: profile & goals.
      </footer>
    </main>
  );
}
