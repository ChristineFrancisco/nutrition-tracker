"use client";

import { useFormStatus } from "react-dom";
import { retryAnalyzeEntry } from "./actions";

/**
 * "Try again" control rendered on Failed entry cards. Submits to
 * `retryAnalyzeEntry`, which re-arms the entry to `pending` and runs
 * the estimator one more time.
 *
 * Awaiting the action means the page takes 5–15s to update; we surface
 * a "Retrying…" state via `useFormStatus` so the user knows the click
 * registered.
 */
export default function RetryAnalyzeButton({ entryId }: { entryId: string }) {
  return (
    <form action={retryAnalyzeEntry}>
      <input type="hidden" name="entry_id" value={entryId} />
      <RetryButton />
    </form>
  );
}

function RetryButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500/80 dark:hover:bg-red-500"
    >
      {pending ? "Retrying…" : "Try again"}
    </button>
  );
}
