"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, recomputeAndSaveGoals } from "@/lib/profile";
import type {
  CompositionFocus,
  GoalKind,
} from "@/lib/targets/types";

/**
 * Flip the signed-in user's profile to "generic" mode and write a fresh
 * FDA Daily Values snapshot into daily_goals.
 *
 * Invoked from the /goals page when a personalized user wants to revert to
 * the one-size-fits-all FDA reference values. Personal fields on the
 * profile (sex, height, weight, etc.) are left untouched — we just change
 * the mode — so if they later switch back to personalized they don't have
 * to re-enter anything.
 */
export async function switchToGeneric(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ target_mode: "generic" })
    .eq("id", user.id);
  if (error) throw new Error(`Update profile failed: ${error.message}`);

  await recomputeAndSaveGoals(
    {
      target_mode: "generic",
      sex: null,
      birth_date: null,
      height_cm: null,
      weight_kg: null,
      activity_level: null,
    },
    user.id,
    "manual"
  );

  redirect("/goals?saved=1");
}

/**
 * Save the goal coach: write the user's chosen direction, weekly
 * weight-change rate, and composition focus to the profile, then
 * recompute and snapshot daily_goals so /today reads the new targets
 * immediately.
 *
 * Validates input before writing — invalid values (out-of-range rate,
 * unknown enum) are silently coerced to safe defaults so a malformed
 * form post can't push past the DB check constraints.
 */
export async function saveGoalCoach(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const goalKind = parseGoalKind(formData.get("goal_kind"));
  // weekly_change_kg comes signed: negative = lose, positive = gain.
  // The form always submits the signed kg value; the rate slider in the
  // UI multiplies its lbs/week selection by ±0.4536 (kg per lb) and
  // applies the sign based on the goalKind radio.
  const rawRate = Number(formData.get("weekly_change_kg") ?? 0);
  const weeklyChangeKg = clamp(
    Number.isFinite(rawRate) ? rawRate : 0,
    -1.0,
    0.5,
  );
  // If the user picks "maintain", force the rate to 0 even if a stale
  // slider value snuck through.
  const finalRate = goalKind === "maintain" ? 0 : weeklyChangeKg;

  const focus = parseCompositionFocus(formData.get("composition_focus"));

  const { error } = await supabase
    .from("profiles")
    .update({
      goal_kind: goalKind,
      weekly_change_kg: finalRate,
      composition_focus: focus,
    })
    .eq("id", user.id);
  if (error) throw new Error(`Update profile failed: ${error.message}`);

  // Reload the full profile to pass to recomputeAndSaveGoals — we need
  // height/weight/activity for the TDEE math, not just the coach
  // fields.
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  await recomputeAndSaveGoals(profile, user.id, "auto");

  // Today + History pages read goals; nudge them to refresh.
  revalidatePath("/today");
  revalidatePath("/goals");

  redirect("/goals?saved=1");
}

function parseGoalKind(v: FormDataEntryValue | null): GoalKind {
  if (v === "lose" || v === "maintain" || v === "gain") return v;
  return "maintain";
}

function parseCompositionFocus(
  v: FormDataEntryValue | null,
): CompositionFocus {
  if (v === "preserve" || v === "recomp" || v === "build") return v;
  return "preserve";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Switch the user's target mode (FDA generic / DRI minimums / Customized
 * goal). Recomputes daily_goals after the switch so /today picks up the
 * new targets immediately.
 *
 * The form sends the desired mode as a hidden input. Anything else
 * gets coerced to "personalized" as a safe fallback — the picker UI
 * always sends a known value, so this only kicks in on a malformed
 * direct POST.
 */
export async function setTargetMode(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const raw = formData.get("mode");
  const mode =
    raw === "generic" || raw === "personalized" || raw === "custom"
      ? raw
      : "personalized";

  const { error } = await supabase
    .from("profiles")
    .update({ target_mode: mode })
    .eq("id", user.id);
  if (error) throw new Error(`Update profile failed: ${error.message}`);

  // Reload the full profile so recomputeAndSaveGoals sees the new mode
  // alongside any goal-coach fields (only meaningful for custom).
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  await recomputeAndSaveGoals(profile, user.id, "manual");

  revalidatePath("/today");
  revalidatePath("/goals");
  redirect("/goals?saved=1");
}
