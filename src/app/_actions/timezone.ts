"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Persist the user's IANA timezone string. Posted by the
 * CaptureTimezone client component on first sign-in (or whenever the
 * stored value drifts from the browser's). Validation: Intl throws
 * on invalid tz strings — we swallow and skip so a bad payload can't
 * poison the profile.
 *
 * No revalidatePath / redirect — this runs as a fire-and-forget
 * effect from the client; the next normal page render picks up the
 * new value via getCurrentProfile.
 */
export async function saveTimezone(tz: string): Promise<void> {
  if (!tz || typeof tz !== "string" || tz.length > 64) return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("profiles")
    .update({ timezone: tz })
    .eq("id", user.id);
  if (error) {
    console.warn("saveTimezone failed:", error.message);
  }
}
