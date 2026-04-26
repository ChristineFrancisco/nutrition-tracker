"use client";

import { deleteEntry } from "./actions";

/**
 * Small client wrapper around the deleteEntry server action so we can
 * prompt the user to confirm before submitting. Kept deliberately tiny
 * so the rest of the Today page can stay a pure server component.
 *
 * Renders inline — the parent decides where to place it. Used at the
 * bottom of the expanded entry-row panel so it's always reachable but
 * out of the way of the resting feed.
 */
export default function DeleteEntryButton({ entryId }: { entryId: string }) {
  return (
    <form
      action={deleteEntry}
      onSubmit={(e) => {
        const ok = window.confirm(
          "Delete this entry? The photo and nutrition data will be removed."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="entry_id" value={entryId} />
      <button
        type="submit"
        aria-label="Delete entry"
        className="text-xs font-medium text-zinc-400 transition hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
      >
        Delete entry
      </button>
    </form>
  );
}
