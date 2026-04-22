"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recomputeAndSaveGoals } from "@/lib/profile";
import type { ActivityLevel, Sex } from "@/lib/targets/types";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

const VALID_SEX: Sex[] = ["male", "female", "other"];
const VALID_ACTIVITY: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

function optionalNumber(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function saveProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  // Saving the profile form is a strong signal the user wants personalized
  // targets. We ignore whatever mode was stored before and always switch to
  // personalized here. Users who want to revert can do so from /goals.
  const mode = "personalized" as const;

  const sexRaw = String(formData.get("sex") ?? "");
  const sex = VALID_SEX.includes(sexRaw as Sex) ? (sexRaw as Sex) : null;

  const birthDateRaw = String(formData.get("birth_date") ?? "").trim();
  const birth_date = birthDateRaw === "" ? null : birthDateRaw;

  const activityRaw = String(formData.get("activity_level") ?? "");
  const activity_level = VALID_ACTIVITY.includes(activityRaw as ActivityLevel)
    ? (activityRaw as ActivityLevel)
    : null;

  const height_cm = optionalNumber(formData.get("height_cm"));
  const weight_kg = optionalNumber(formData.get("weight_kg"));

  if (!sex) {
    return { status: "error", message: "Please select your biological sex." };
  }
  if (!birth_date) {
    return { status: "error", message: "Please enter your date of birth." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      target_mode: mode,
      sex,
      birth_date,
      height_cm,
      weight_kg,
      activity_level,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (upErr) return { status: "error", message: upErr.message };

  try {
    await recomputeAndSaveGoals(
      {
        target_mode: mode,
        sex,
        birth_date,
        height_cm,
        weight_kg,
        activity_level,
      },
      user.id
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save goals.";
    return { status: "error", message };
  }

  redirect("/goals?saved=1");
}
