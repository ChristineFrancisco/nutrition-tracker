"use client";

import { useState } from "react";
import CaptureForm from "./CaptureForm";
import TextEntryForm from "./TextEntryForm";

type Mode = "closed" | "choose" | "photo" | "text";

/**
 * Orchestrator for the "add an entry" flow. Replaces the old
 * always-visible CaptureForm with a compact entry point that opens a
 * chooser ("Photo" vs "Text"), then mounts the matching sub-form.
 *
 * Design notes:
 *  - State lives here rather than in each sub-form so switching modes
 *    drops all sub-form state cleanly (a half-typed description isn't
 *    preserved when you bounce to photo mode — that's fine, and keeps
 *    the state model simple).
 *  - Both sub-forms are passed `onCancel` (→ "choose") and `onSaved`
 *    (→ "closed"). On save we collapse all the way back to the "+ Add
 *    an entry" button so the Today feed is immediately visible — the
 *    new pending card shows up via revalidatePath from the server
 *    action, so the user's attention lands on it naturally.
 *  - The chooser uses large tap targets styled as two cards rather
 *    than a modal or dropdown: this is a mobile-first app and the
 *    photo/text choice is the primary action on the page.
 */
export default function AddEntry({ userId }: { userId: string }) {
  const [mode, setMode] = useState<Mode>("closed");

  if (mode === "photo") {
    return (
      <CaptureForm
        userId={userId}
        onCancel={() => setMode("choose")}
        onSaved={() => setMode("closed")}
      />
    );
  }

  if (mode === "text") {
    return (
      <TextEntryForm
        onCancel={() => setMode("choose")}
        onSaved={() => setMode("closed")}
      />
    );
  }

  if (mode === "choose") {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">How are you logging?</h2>
            <p className="mt-1 text-sm text-zinc-500">
              A photo gives the most accurate estimate. Typing works if you
              don&apos;t have one.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("closed")}
            className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            Cancel
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("photo")}
            className="group flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-brand-500 dark:hover:bg-brand-500/5"
          >
            <span className="text-2xl" aria-hidden>
              📷
            </span>
            <span className="font-medium">Photo</span>
            <span className="text-xs text-zinc-500">
              Snap what you&apos;re eating — best accuracy, especially for
              portion size.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("text")}
            className="group flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/30 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-brand-500 dark:hover:bg-brand-500/5"
          >
            <span className="text-2xl" aria-hidden>
              ✍️
            </span>
            <span className="font-medium">Text</span>
            <span className="text-xs text-zinc-500">
              Describe the meal in a sentence or two. Good for when a photo
              isn&apos;t possible.
            </span>
          </button>
        </div>
      </section>
    );
  }

  // mode === "closed"
  return (
    <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setMode("choose")}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        <span className="text-base" aria-hidden>
          +
        </span>
        Add an entry
      </button>
      <p className="mt-2 text-center text-xs text-zinc-400">
        Snap a photo or describe your meal in text.
      </p>
    </section>
  );
}
