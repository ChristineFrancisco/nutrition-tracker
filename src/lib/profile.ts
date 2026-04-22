import { createClient } from "@/lib/supabase/server";
import { computeGoals } from "@/lib/targets/compute";
import type { Nutrients, ProfileForGoals } from "@/lib/targets/types";

export type ProfileRow = ProfileForGoals & {
  id: string;
  display_name: string | null;
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

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Load profile failed: ${error.message}`);
  if (data) return data as ProfileRow;

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
  return fresh as ProfileRow;
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

  // Strip metadata columns so we return a pure Nutrients shape.
  const {
    id: _id,
    user_id: _uid,
    effective_from: _eff,
    source: _src,
    created_at: _cr,
    ...nutrients
  } = data as Record<string, unknown>;
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
