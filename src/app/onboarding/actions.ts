"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recomputeAndSaveGoals } from "@/lib/profile";

/**
 * Server Action: user picked "generic" or "personalized" on onboarding.
 *
 *  - generic     → mark onboarded immediately, compute FDA goals, go to /today
 *  - personalized → set mode and route to /profile to collect details
 */
export async function pickTargetMode(formData: FormData): Promise<void> {
  const mode = String(formData.get("mode") ?? "");
  if (mode !== "generic" && mode !== "personalized") {
    throw new Error("Invalid target mode.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (mode === "generic") {
    const { error } = await supabase
      .from("profiles")
      .update({
        target_mode: "generic",
        onboarded_at: new Date().toISOString(),
      })
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
      user.id
    );

    redirect("/today");
  }

  // Personalized: set the mode, leave onboarded_at null until the
  // profile form is submitted.
  const { error } = await supabase
    .from("profiles")
    .update({ target_mode: "personalized" })
    .eq("id", user.id);
  if (error) throw new Error(`Update profile failed: ${error.message}`);

  redirect("/profile?new=1");
}
