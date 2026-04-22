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
  /** Short-lived signed URL for the photo. Null if photo was deleted / expired. */
  photo_url: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — plenty for a page render.

/**
 * Load today's entries for the signed-in user and attach freshly-signed
 * Storage URLs for any photos that haven't expired yet.
 *
 * "Today" is computed in the server's timezone (UTC on Supabase). Good
 * enough for v1 — swap to a profile.timezone column if it becomes a pain.
 */
export async function getTodayEntries(): Promise<EntryRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, eaten_at, photo_path, photo_expires_at, user_note, status, rejection_reason"
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
