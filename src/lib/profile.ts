import { createClient } from "@/lib/supabase/server";
import { computeGoals } from "@/lib/targets/compute";
import type { Nutrients, ProfileForGoals } from "@/lib/targets/types";

export type ProfileRow = ProfileForGoals & {
  id: string;
  display_name: string | null;
  /** From auth.users — not stored on profiles. Filled in by
   *  getCurrentProfile so the UI can render the signed-in identity
   *  in headers and menus without a second round-trip. */
  email: string;
  onboarded_at: string | null;
  photo_retention_hours: number;
};

/**
 * Load the signed-in user's profile row. Returns null if the user isn't
 * signed in; throws on any other database error so the caller can
 * surface a real error page.
 */
const PROFILE_SELECT =
  "id, display_name, target_mode, sex, birth_date, height_cm, weight_kg, activity_level, onboarded_at, photo_retention_hours";

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const email = user.email ?? "";

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Load profile failed: ${error.message}`);
  if (data) return { ...(data as Omit<ProfileRow, "email">), email };

  // Profile row missing — user pre-dates the trigger. Backfill it.
  const { error: insertError } = await supabase
    .from("profiles")
    .insert({ id: user.id });
  if (insertError) throw new Error(`Create profile failed: ${insertError.message}`);

  const { data: fresh, error: fetchError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();
  if (fetchError) throw new Error(`Load profile failed: ${fetchError.message}`);
  return { ...(fresh as Omit<ProfileRow, "email">), email };
}

/**
 * Fetch the most recent daily_goals snapshot for the signed-in user.
 * Returns null if they haven't been onboarded yet.
 */
export async function getLatestGoals(): Promise<Nutrients | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Load goals failed: ${error.message}`);
  if (!data) return null;

  return stripGoalMetadata(data as Record<string, unknown>);
}

/**
 * Fetch the goals snapshot that was in effect on a given local calendar
 * day — i.e. the most recent snapshot whose `effective_from` is on or
 * before the end of that day. This is what history views should use so
 * past totals aren't retroactively compared against today's targets.
 *
 * If no snapshot was in effect yet on that date, we fall back to the
 * earliest snapshot rather than returning null — that's the right thing
 * for "you logged something on day 0, before we had your goals" edge
 * cases; better to show something than throw a not-found.
 */
export async function getGoalsEffectiveOn(
  day: Date
): Promise<Nutrients | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);

  // Most-recent snapshot at or before end-of-day.
  const { data, error } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("user_id", user.id)
    .lte("effective_from", endOfDay.toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Load goals failed: ${error.message}`);
  if (data) return stripGoalMetadata(data as Record<string, unknown>);

  // Nothing was in effect yet — fall back to the earliest ever snapshot
  // so the history page still renders sensibly.
  const { data: fallback, error: fbErr } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("effective_from", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fbErr) throw new Error(`Load goals failed: ${fbErr.message}`);
  if (!fallback) return null;
  return stripGoalMetadata(fallback as Record<string, unknown>);
}

/** Strip the metadata columns so we return a pure Nutrients shape. */
function stripGoalMetadata(row: Record<string, unknown>): Nutrients {
  const {
    id: _id,
    user_id: _uid,
    effective_from: _eff,
    effective_date: _effd,
    source: _src,
    created_at: _cr,
    ...nutrients
  } = row;
  return nutrients as unknown as Nutrients;
}

/**
 * Recompute the user's goals from their current profile and write a
 * daily_goals snapshot.
 *
 * At most one snapshot per user per UTC day — same-day saves upsert into
 * the existing row (unique index from migration 0004). Cross-day history
 * is preserved, so reports for past entries can still reference the
 * snapshot that was active when they were logged.
 *
 * We bump `effective_from` to now() on every save so the timestamp
 * reflects the most recent edit; the generated `effective_date` column
 * recomputes automatically and keeps us in the same conflict slot.
 */
export async function recomputeAndSaveGoals(
  profile: ProfileForGoals,
  userId: string,
  source: "auto" | "manual" = "auto"
): Promise<Nutrients> {
  const goals = computeGoals(profile);
  const supabase = await createClient();

  const { error } = await supabase
    .from("daily_goals")
    .upsert(
      {
        user_id: userId,
        source,
        effective_from: new Date().toISOString(),
        ...goals,
      },
      { onConflict: "user_id,effective_date" }
    );

  if (error) throw new Error(`Save goals failed: ${error.message}`);
  return goals;
}
