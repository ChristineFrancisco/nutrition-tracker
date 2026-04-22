"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recomputeAndSaveGoals } from "@/lib/profile";

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
