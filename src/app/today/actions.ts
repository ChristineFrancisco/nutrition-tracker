"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEstimator } from "@/lib/estimator";
import type { AnalyzeResult, EstimatedItem } from "@/lib/estimator/types";
import type { Nutrients } from "@/lib/targets/types";

/**
 * Per-user cap on successful analyses per rolling 24h window. See
 * plan.md §12. "Successful" = status in ('analyzed','rejected'); failed
 * rows don't count so the user can retry after a model error.
 */
const DAILY_ANALYSIS_CAP = 20;
/** How long a signed photo URL lives when we hand it to Claude. */
const ANALYZE_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Create an `entries` row referencing a photo the client has already
 * uploaded to Storage. We re-verify ownership by checking the path
 * prefix — clients can only write under their own user-id folder per the
 * bucket policy, but belt-and-suspenders is cheap here.
 *
 * photo_expires_at is set from the user's profile.photo_retention_hours
 * (defaulted to 168h = 7 days). A future cron job nulls out photo_path
 * and removes the underlying Storage object once the entry expires.
 *
 * Returns the new entry's id so the client can immediately kick off
 * `analyzeEntry` against it.
 */
export async function createEntry(
  formData: FormData
): Promise<{ entryId: string }> {
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

  const { data: inserted, error: insertErr } = await supabase
    .from("entries")
    .insert({
      user_id: user.id,
      photo_path: photoPath,
      photo_expires_at: photoExpiresAt,
      user_note,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !inserted)
    throw new Error(
      `Create entry failed: ${insertErr?.message ?? "no row returned"}`
    );

  // Revalidate the feed so the new entry appears on the next render.
  // We deliberately don't redirect — the client calls this from a fetch
  // inside CaptureForm and handles its own post-success reset. Throwing a
  // NEXT_REDIRECT sentinel here would look like an error to the client's
  // try/catch.
  revalidatePath("/today");

  return { entryId: inserted.id };
}

/**
 * Kick off AI analysis for a previously-created entry. Idempotent in the
 * sense that a row that's already non-pending is left alone — the client
 * can safely retry if the connection drops mid-call.
 *
 * Flow:
 *   1. Verify ownership + pending status.
 *   2. Check the per-user 24h analysis cap.
 *   3. Sign a short-lived URL for the photo.
 *   4. Call the estimator (Gemini 2.5 Flash by default).
 *   5. On ok → write entry_items + set status='analyzed'.
 *      On rejected → set status='rejected' + rejection_reason.
 *      On exception → set status='failed' + stash the error in model_notes.
 *
 * Throws on auth failures (so the wrapper redirects). Swallows estimator
 * errors into the DB row so the UI stays informative instead of
 * surfacing a raw HTTP 500.
 */
export async function analyzeEntry(entryId: string): Promise<void> {
  if (!entryId) throw new Error("Missing entry id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load the entry + confirm it still belongs to the caller. Status
  // gating: `pending` is the normal flow; `failed` is a manual retry
  // from the UI — we re-arm it to pending first so the card flips back
  // to "Analyzing…" and model_notes gets cleared. Terminal success
  // states (`analyzed`, `rejected`) are left alone so a double-click
  // doesn't double-charge.
  const { data: entry, error: entryErr } = await supabase
    .from("entries")
    .select("id, photo_path, user_note, status")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (entryErr) throw new Error(`Load entry failed: ${entryErr.message}`);
  if (!entry) return; // deleted or RLS filtered — nothing to do
  if (entry.status === "analyzed" || entry.status === "rejected") return;
  if (!entry.photo_path) {
    await markFailed(entryId, user.id, "Photo is missing.");
    return;
  }
  if (entry.status === "failed") {
    const { error: retryErr } = await supabase
      .from("entries")
      .update({ status: "pending", model_notes: null })
      .eq("id", entryId)
      .eq("user_id", user.id);
    if (retryErr) throw new Error(`Retry reset failed: ${retryErr.message}`);
    revalidatePath("/today");
  }

  // ---- Rate limit: 20 successful analyses / rolling 24h ----
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["analyzed", "rejected"])
    .gte("created_at", since);
  if (countErr) throw new Error(`Quota check failed: ${countErr.message}`);
  if ((count ?? 0) >= DAILY_ANALYSIS_CAP) {
    await markFailed(
      entryId,
      user.id,
      `Daily analysis limit reached (${DAILY_ANALYSIS_CAP} per 24h). Try again later.`
    );
    return;
  }

  // ---- Sign a short-lived URL for the model to fetch ----
  const { data: signed, error: signErr } = await supabase.storage
    .from("food-photos")
    .createSignedUrl(entry.photo_path, ANALYZE_SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    await markFailed(
      entryId,
      user.id,
      `Could not sign photo URL: ${signErr?.message ?? "no url"}`
    );
    return;
  }

  // ---- Call the estimator ----
  let result: AnalyzeResult;
  try {
    result = await getEstimator().analyze({
      imageUrl: signed.signedUrl,
      userNote: entry.user_note ?? undefined,
    });
  } catch (err) {
    await markFailed(
      entryId,
      user.id,
      `Analysis error: ${(err as Error).message.slice(0, 400)}`
    );
    return;
  }

  // ---- Persist the result ----
  if (result.status === "rejected") {
    const { error: rejErr } = await supabase
      .from("entries")
      .update({
        status: "rejected",
        rejection_reason: result.reason,
      })
      .eq("id", entryId)
      .eq("user_id", user.id);
    if (rejErr) throw new Error(`Mark rejected failed: ${rejErr.message}`);
    revalidatePath("/today");
    return;
  }

  // result.status === "ok" — insert items, then flip the entry.
  // We re-sum totals server-side so the UI never trusts the model's
  // arithmetic. Anything the model put in `totals` is ignored beyond
  // logging.
  const serverTotals = sumItemNutrients(result.items);
  const itemRows = result.items.map((item) => ({
    entry_id: entryId,
    name: item.name,
    estimated_serving: item.estimated_serving,
    confidence: item.confidence,
    reasoning: item.reasoning ?? null,
    nutrients: item.nutrients,
  }));

  // entry_items RLS already allows inserts for rows whose entry belongs
  // to the caller, so the normal (cookie-authed) client works here.
  const { error: itemsErr } = await supabase
    .from("entry_items")
    .insert(itemRows);
  if (itemsErr) {
    await markFailed(
      entryId,
      user.id,
      `Persist items failed: ${itemsErr.message}`
    );
    return;
  }

  // serverTotals is computed but not persisted to `entries` — the schema
  // keeps totals implicit via the sum of entry_items.nutrients, which M5
  // (rollups) will consume. For now we only stash a short summary string.
  void serverTotals;

  const modelNotes = buildModelNotes(
    result.modelNotes,
    result.good_highlights,
    result.bad_highlights
  );

  const { error: updErr } = await supabase
    .from("entries")
    .update({
      status: "analyzed",
      model_notes: modelNotes,
    })
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (updErr) throw new Error(`Mark analyzed failed: ${updErr.message}`);

  revalidatePath("/today");
}

/**
 * FormData-compatible wrapper around `analyzeEntry` so a plain server
 * `<form action={retryAnalyzeEntry}>` can call it from a Server
 * Component (see RetryAnalyzeButton). Awaits the analyze call so the
 * revalidated /today render reflects the new status — for the retry
 * flow the user explicitly asked us to wait.
 */
export async function retryAnalyzeEntry(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  if (!entryId) throw new Error("Missing entry id.");
  await analyzeEntry(entryId);
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

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Mark an entry as `failed` with a short explanation in model_notes.
 * Used for any unexpected condition during analysis (rate limit, signed
 * URL failure, estimator exception) so the UI can render a Failed badge
 * instead of a row stuck in pending.
 */
async function markFailed(
  entryId: string,
  userId: string,
  note: string
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("entries")
    .update({ status: "failed", model_notes: note })
    .eq("id", entryId)
    .eq("user_id", userId);
  revalidatePath("/today");
}

/** Sum nutrient numbers across items, server-side, in case the model's
 *  totals are wrong or missing. Every Nutrients key is summed. */
function sumItemNutrients(items: EstimatedItem[]): Nutrients {
  const keys = Object.keys(items[0]?.nutrients ?? {}) as (keyof Nutrients)[];
  const totals = Object.fromEntries(keys.map((k) => [k, 0])) as Nutrients;
  for (const item of items) {
    for (const k of keys) {
      totals[k] = (totals[k] ?? 0) + (item.nutrients[k] ?? 0);
    }
  }
  return totals;
}

/** Compose a short model_notes string that includes the model's summary
 *  plus any good/bad highlights. Persisted alongside the entry row so it
 *  renders on the Today card without a join to entry_items. */
function buildModelNotes(
  summary: string,
  good: string[] | undefined,
  bad: string[] | undefined
): string {
  const parts: string[] = [summary.trim()];
  if (good && good.length > 0) parts.push(`Good: ${good.join(", ")}`);
  if (bad && bad.length > 0) parts.push(`Watch: ${bad.join(", ")}`);
  return parts.filter(Boolean).join(" · ").slice(0, 1000);
}
