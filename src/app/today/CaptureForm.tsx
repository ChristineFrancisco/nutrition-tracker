"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { createEntry } from "./actions";

type Phase =
  | "idle"
  | "compressing"
  | "uploading"
  | "saving"
  | "saved"
  | "error";

export default function CaptureForm({ userId }: { userId: string }) {
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

  function reset() {
    setFile(null);
    setNote("");
    setPhase("idle");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      await createEntry(form);

      // Success — reset for the next capture. The server action already
      // called revalidatePath("/today"), so the feed below will update
      // on the next render cycle. Briefly show a "saved" state so the
      // interaction feels confirmed.
      setPhase("saved");
      setFile(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => {
        setPhase((p) => (p === "saved" ? "idle" : p));
      }, 2000);
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
      <h2 className="text-lg font-semibold">Snap a meal</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Take a photo of what you&apos;re eating — we&apos;ll identify it and
        estimate nutrition.
      </p>

      {!isOnline && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        >
          You&apos;re offline. Nutrition analysis runs on our server, so
          capture is paused until you reconnect.
        </div>
      )}

      {phase === "saved" && (
        <div
          role="status"
          className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          Entry saved — analyzing nutrition…
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
                Note <span className="font-normal text-zinc-400">(optional)</span>
              </span>
              <textarea
                name="user_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. lunch portion, homemade, extra sauce on the side"
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
                onClick={reset}
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
