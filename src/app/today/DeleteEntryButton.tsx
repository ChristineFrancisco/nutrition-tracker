"use client";

import { deleteEntry } from "./actions";

/**
 * Small client wrapper around the deleteEntry server action so we can
 * prompt the user to confirm before submitting. Kept deliberately tiny
 * so the rest of the Today page can stay a pure server component.
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
      className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
    >
      <input type="hidden" name="entry_id" value={entryId} />
      <button
        type="submit"
        aria-label="Delete entry"
        className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-black/80"
      >
        Delete
      </button>
    </form>
  );
}
