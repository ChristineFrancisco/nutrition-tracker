"use client";

import { use } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-3 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send magic link"}
    </button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [state, formAction] = useActionState(sendMagicLink, initialState);
  const { next: nextParam } = use(searchParams);
  const next = nextParam ?? "/today";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Nutrition Tracker</h1>
          <p className="text-sm text-zinc-500">
            Sign in with a magic link — no password needed.
          </p>
        </div>

        {state.status === "sent" ? (
          <div className="space-y-2 rounded-lg bg-brand-50 p-4 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
            <p className="font-medium">Check your email.</p>
            <p>
              We sent a sign-in link to <strong>{state.email}</strong>. Click
              the link to finish signing in.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            {state.status === "error" && (
              <p className="text-sm text-red-600" role="alert">
                {state.message}
              </p>
            )}
            <SubmitButton />
          </form>
        )}
      </div>
    </main>
  );
}
