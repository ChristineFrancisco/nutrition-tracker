import { createClient } from "@/lib/supabase/server";

export type EntryStatus = "pending" | "analyzed" | "failed" | "rejected";

export type EntryRow = {
  id: string;
  eaten_at: string;
  photo_path: string | null;
  photo_expires_at: string | null;
  user_note: string | null;
  status: EntryStatus;
  /** Populated by the AI estimator when status='rejected' (e.g. not food). */
  rejection_reason: string | null;
  /** Short free-text notes from the estimator. For `failed` entries this
   *  is the error reason (rate limit, API key missing, JSON parse fail,
   *  etc.) — we surface it on the card so the user isn't staring at a
   *  silent red badge. For `analyzed` entries it's the model's summary. */
  model_notes: string | null;
  /** Short-lived signed URL for the photo. Null if photo was deleted / expired. */
  photo_url: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — plenty for a page render.

/**
 * Load today's entries for the signed-in user and attach freshly-signed
 * Storage URLs for any photos that haven't expired yet.
 *
 * "Today" is computed in the Node.js process's local timezone. On your
 * laptop that's your wall-clock tz; on Vercel it defaults to UTC, which
 * would drift from the user's actual "today" — fix that later by adding
 * a `profiles.timezone` column (populated from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` at sign-up) and
 * computing the boundary from it.
 */
export async function getTodayEntries(): Promise<EntryRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Use local time on purpose — setUTCHours would cut off entries made
  // earlier today whenever the UTC day has already rolled over.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, eaten_at, photo_path, photo_expires_at, user_note, status, rejection_reason, model_notes"
    )
    .eq("user_id", user.id)
    .gte("eaten_at", startOfDay.toISOString())
    .order("eaten_at", { ascending: false });

  if (error) throw new Error(`Load entries failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Sign only the paths that still exist. Batch into one call per entry;
  // Supabase doesn't have a bulk sign-paths endpoint but these are
  // lightweight HMAC operations.
  const withUrls = await Promise.all(
    data.map(async (row) => {
      if (!row.photo_path) return { ...row, photo_url: null };
      const { data: signed, error: signErr } = await supabase.storage
        .from("food-photos")
        .createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
      if (signErr) {
        // Most common cause: the object has been cleaned up but the row
        // hasn't been updated yet. Treat as "photo gone", don't blow up.
        return { ...row, photo_url: null };
      }
      return { ...row, photo_url: signed.signedUrl };
    })
  );

  return withUrls as EntryRow[];
}
