"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Create an `entries` row referencing a photo the client has already
 * uploaded to Storage. We re-verify ownership by checking the path
 * prefix — clients can only write under their own user-id folder per the
 * bucket policy, but belt-and-suspenders is cheap here.
 *
 * photo_expires_at is set from the user's profile.photo_retention_hours
 * (defaulted to 168h = 7 days). A future cron job nulls out photo_path
 * and removes the underlying Storage object once the entry expires.
 */
export async function createEntry(formData: FormData): Promise<void> {
  const photoPath = String(formData.get("photo_path") ?? "").trim();
  const userNoteRaw = String(formData.get("user_note") ?? "").trim();
  const user_note = userNoteRaw === "" ? null : userNoteRaw.slice(0, 500);

  if (!photoPath) throw new Error("Missing photo path.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Defense-in-depth: the bucket policy enforces this, but verify here so
  // a malicious client can't point at someone else's photo.
  if (!photoPath.startsWith(`${user.id}/`)) {
    throw new Error("Photo path does not belong to you.");
  }

  // Pull the user's retention preference; fall back to the column default.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("photo_retention_hours")
    .eq("id", user.id)
    .single();
  if (profileErr) throw new Error(`Load profile failed: ${profileErr.message}`);

  const retentionHours = profile?.photo_retention_hours ?? 168;
  const photoExpiresAt = new Date(
    Date.now() + retentionHours * 60 * 60 * 1000
  ).toISOString();

  const { error: insertErr } = await supabase.from("entries").insert({
    user_id: user.id,
    photo_path: photoPath,
    photo_expires_at: photoExpiresAt,
    user_note,
    status: "pending",
  });
  if (insertErr) throw new Error(`Create entry failed: ${insertErr.message}`);

  // Revalidate the feed so the new entry appears on the next render.
  // We deliberately don't redirect — the client calls this from a fetch
  // inside CaptureForm and handles its own post-success reset. Throwing a
  // NEXT_REDIRECT sentinel here would look like an error to the client's
  // try/catch.
  revalidatePath("/today");
}

/**
 * Remove an entry the user logged. Also deletes the Storage object so we
 * don't leak images past when their data row is gone.
 */
export async function deleteEntry(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) throw new Error("Missing entry id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Grab the path before we drop the row so we can clean up Storage.
  const { data: entry } = await supabase
    .from("entries")
    .select("photo_path")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: delErr } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (delErr) throw new Error(`Delete entry failed: ${delErr.message}`);

  if (entry?.photo_path) {
    await supabase.storage.from("food-photos").remove([entry.photo_path]);
    // Storage errors here are non-fatal — the data row is the source of
    // truth and the photo will expire on its own.
  }

  revalidatePath("/today");
}
