"use client";

import { useFormStatus } from "react-dom";
import { refineEntry } from "./actions";

/**
 * Inline form shown on an analyzed/rejected/failed card when the user
 * clicks "Refine". The textarea is pre-filled with the entry's current
 * user_note so the user can modify it — add corrections like "the
 * lemons and limes in the background aren't part of this meal", or
 * rewrite portions, or clarify a brand the AI missed.
 *
 * The submit posts to the `refineEntry` server action which clears
 * out the previous run's items, resets the entry to pending, and
 * re-runs analyzeEntry. Because the action awaits the analyze call,
 * the /today revalidate reflects the final status (analyzed/failed/
 * rejected) in a single roundtrip — no client-side "analyzing" flip
 * needed.
 *
 * Uses an uncontrolled `defaultValue` textarea so we don't have to
 * pull the whole client-state pattern in; cancel just unmounts the
 * form and the parent card drops the user's in-progress edit.
 */
export default function RefineEntryForm({
  entryId,
  currentNote,
  entryType,
  onCancel,
}: {
  entryId: string;
  currentNote: string;
  entryType: "photo" | "text";
  onCancel: () => void;
}) {
  return (
    <form
      action={refineEntry}
      className="mt-2 space-y-2 rounded-lg border border-brand-300 bg-brand-50/40 p-2.5 dark:border-brand-500/40 dark:bg-brand-500/10"
    >
      <input type="hidden" name="entry_id" value={entryId} />

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
          Description for re-analysis
        </span>
        <textarea
          name="description"
          defaultValue={currentNote}
          rows={4}
          maxLength={1000}
          required
          minLength={10}
          placeholder={
            entryType === "photo"
              ? "e.g. The lemons and limes in the background aren't part of this meal — just the grapefruit half."
              : "e.g. Chipotle chicken bowl, white rice, black beans, mild salsa, cheese — regular portion. No sour cream."
          }
          className="w-full resize-none rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[12px] leading-snug outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {entryType === "photo"
          ? "The photo stays the same — only the description changes. Exclude items the AI shouldn't count, name brands it missed, or clarify portion sizes."
          : "Edit the description to correct the estimate."}{" "}
        This counts against your daily analysis limit.
      </p>

      <div className="flex items-center gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Re-analyzing…" : "Re-analyze"}
    </button>
  );
}
