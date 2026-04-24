"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeEntry, createTextEntry } from "./actions";

type Phase = "idle" | "saving" | "saved" | "error";

/**
 * Text-only entry form. Counterpart to CaptureForm (photo path) under
 * the AddEntry orchestrator. The user types a description of their
 * meal; the server hands that string to the estimator's text prompt.
 *
 * UX design:
 *  - A compact "what helps" tip card sits above the textarea so the
 *    first-time user sees what makes a good description without
 *    burying it in a modal.
 *  - The textarea's placeholder carries three concrete examples so the
 *    shape is obvious at a glance.
 *  - 10-char minimum is enforced on the client for immediate feedback
 *    and repeated on the server (createTextEntry) so a malicious client
 *    can't bypass it.
 *
 * Shared bits with CaptureForm (online detection, busy phases, error
 * surfacing) are duplicated rather than extracted — there are only two
 * forms and they'll drift as each grows its own affordances.
 */
export default function TextEntryForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showTip, setShowTip] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Autofocus the textarea when the form mounts so the user can start
  // typing immediately — matches the feel of opening a native note app.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const charCount = description.trim().length;
  const tooShort = charCount > 0 && charCount < 10;
  const canSubmit =
    !tooShort && charCount >= 10 && phase !== "saving" && isOnline;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMsg(null);
    try {
      setPhase("saving");
      const form = new FormData();
      form.set("description", description.trim());
      const { entryId } = await createTextEntry(form);

      setPhase("saved");
      setDescription("");
      onSaved();

      // Fire-and-forget analysis, same pattern as CaptureForm. A failure
      // here is stored on the entry row by the server action; the card
      // will flip to Failed and show a Retry button.
      analyzeEntry(entryId).catch((err) => {
        console.error("analyzeEntry failed:", err);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setErrorMsg(message);
      setPhase("error");
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Describe your meal</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Type what you ate — we&apos;ll estimate nutrition from your
            description. No photo needed.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ← Back
        </button>
      </div>

      {!isOnline && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        >
          You&apos;re offline. Nutrition analysis runs on our server, so
          logging is paused until you reconnect.
        </div>
      )}

      {showTip && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-100">
          <div className="space-y-1.5">
            <p className="font-medium">
              A good description includes most of these:
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              <li>
                <span className="font-medium">What it is</span> — name the
                food (e.g. &ldquo;chicken caesar salad&rdquo;, not just
                &ldquo;salad&rdquo;)
              </li>
              <li>
                <span className="font-medium">How much</span> — portion with
                a reference (1 cup, 2 slices, ~150 g, half a bowl)
              </li>
              <li>
                <span className="font-medium">Brand or restaurant</span> if
                applicable (Chipotle, Naya, Chobani, Classico) — we&apos;ll
                use their published nutrition data when we know it
              </li>
              <li>
                <span className="font-medium">How it was made</span> —
                grilled, fried, raw, homemade
              </li>
              <li>
                <span className="font-medium">Extras</span> — dressings,
                sauces, sides, toppings you added
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setShowTip(false)}
            className="shrink-0 text-xs underline-offset-2 hover:underline"
            aria-label="Dismiss tip"
          >
            Got it
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">What did you eat?</span>
          <textarea
            ref={textareaRef}
            name="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (phase === "error") {
                setPhase("idle");
                setErrorMsg(null);
              }
            }}
            rows={5}
            maxLength={1000}
            placeholder={
              "Chipotle chicken burrito bowl with white rice, black beans, mild salsa, cheese, sour cream, and lettuce — regular portion\n\n" +
              "or: 2 slices of whole-wheat toast with ~2 tbsp peanut butter and a medium banana\n\n" +
              "or: homemade spaghetti with Classico marinara and 4 oz ground turkey, about 1.5 cups pasta"
            }
            className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                tooShort
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-400"
              }
            >
              {tooShort
                ? `Add a bit more detail (${10 - charCount} more character${
                    10 - charCount === 1 ? "" : "s"
                  })`
                : charCount === 0
                  ? "At least 10 characters"
                  : `${charCount} character${charCount === 1 ? "" : "s"}`}
            </span>
            <span className="text-zinc-400">{description.length} / 1000</span>
          </div>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "saving" ? "Saving…" : "Log this meal"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={phase === "saving"}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Discard
          </button>
        </div>

        {phase === "error" && errorMsg && (
          <p className="text-sm text-red-600" role="alert">
            {errorMsg}
          </p>
        )}
      </form>

      <p className="mt-4 text-xs text-zinc-400">
        Without a photo, estimates lean toward typical portion sizes — the
        more specific you are, the better the numbers.
      </p>
    </section>
  );
}
