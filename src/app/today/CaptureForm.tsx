"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { analyzeEntry, createEntry } from "./actions";

type Phase =
  | "idle"
  | "compressing"
  | "uploading"
  | "saving"
  | "saved"
  | "error";

export default function CaptureForm({
  userId,
  eatenAtDate,
  onCancel,
  onSaved,
}: {
  userId: string;
  /** When set (YYYY-MM-DD local), the entry is backdated to that day. */
  eatenAtDate?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [showTip, setShowTip] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track online/offline. Plan §9: capture is disabled when offline because
  // nutrition analysis needs the server.
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

  // Object URL lifecycle for the preview — revoke when we swap files.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Discard = clear the form AND tell the orchestrator to collapse back
  // to the chooser. Picking a different photo is done via the file input
  // directly, so we don't need a "clear only" affordance.
  function discard() {
    setFile(null);
    setNote("");
    setPhase("idle");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onCancel();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!isOnline) {
      setErrorMsg("You need to be online to log entries.");
      setPhase("error");
      return;
    }

    setErrorMsg(null);
    try {
      setPhase("compressing");
      const { blob } = await compressImage(file);

      setPhase("uploading");
      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("food-photos")
        .upload(path, blob, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      setPhase("saving");
      const form = new FormData();
      form.set("photo_path", path);
      form.set("user_note", note);
      if (eatenAtDate) form.set("eaten_on", eatenAtDate);
      const { entryId } = await createEntry(form);

      // Success — createEntry has already called revalidatePath("/today"),
      // so the pending card appears on the next render cycle. Hand control
      // back to the AddEntry orchestrator, which will collapse us back to
      // the closed state.
      setPhase("saved");
      setFile(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSaved();

      // Kick off AI analysis without awaiting. The HTTP POST stays open
      // until the server action completes (5–15s on Gemini Flash), at
      // which point a second revalidatePath("/today") fires and the feed
      // updates from "Analyzing…" to "Analyzed" or "Not food". We don't
      // block the UI on it — the user is free to snap another photo.
      analyzeEntry(entryId).catch((err) => {
        // The action marks the row as `failed` on exceptions, so this
        // console.error is just for local debugging.
        console.error("analyzeEntry failed:", err);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setErrorMsg(message);
      setPhase("error");
    }
  }

  const busy =
    phase === "compressing" || phase === "uploading" || phase === "saving";
  const submitLabel =
    phase === "compressing"
      ? "Preparing…"
      : phase === "uploading"
        ? "Uploading…"
        : phase === "saving"
          ? "Saving…"
          : "Log this meal";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Snap a meal</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {eatenAtDate
              ? "Add a photo for this past day — we'll identify it and estimate nutrition."
              : "Take a photo of what you're eating — we'll identify it and estimate nutrition."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
          capture is paused until you reconnect.
        </div>
      )}

      {showTip && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-100">
          <p>
            <span className="font-medium">Tip:</span> include your hand, a
            fork, or a cup in the frame for better portion estimates.
          </p>
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
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected meal"
            className="aspect-square w-full rounded-xl object-cover"
          />
        ) : (
          <label
            htmlFor="photo-input"
            className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 transition hover:border-brand-400 hover:bg-brand-50/30 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-brand-500 dark:hover:bg-brand-500/5"
          >
            <span className="text-3xl" aria-hidden>
              📷
            </span>
            <span className="mt-2 font-medium">Take a photo</span>
            <span className="mt-0.5 text-xs text-zinc-400">
              or choose from your library
            </span>
          </label>
        )}

        <input
          ref={fileInputRef}
          id="photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy || !isOnline}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setPhase("idle");
            setErrorMsg(null);
          }}
          className="sr-only"
        />

        {file && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                What is it?{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </span>
              <span className="block text-xs text-zinc-500">
                A photo alone can be ambiguous — a sentence or two helps the
                AI identify brands, ingredients, and portion cues it
                can&apos;t see.
              </span>
              <textarea
                name="user_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  "e.g. Classico spaghetti sauce with diced mushrooms and carrots\n" +
                  "or: Naya bowl — chicken shawarma, rice, garlic sauce\n" +
                  "or: homemade, half portion"
                }
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !isOnline}
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLabel}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={busy}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Discard
              </button>
            </div>
          </>
        )}

        {phase === "error" && errorMsg && (
          <p className="text-sm text-red-600" role="alert">
            {errorMsg}
          </p>
        )}
      </form>

      <p className="mt-4 text-xs text-zinc-400">
        Photos are automatically deleted 7 days after upload. Your nutrition
        data is kept.
      </p>
    </section>
  );
}
