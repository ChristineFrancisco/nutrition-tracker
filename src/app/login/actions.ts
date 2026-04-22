"use server";

import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/**
 * Server Action: ask Supabase to email a magic link to the given address.
 * The link lands on /auth/callback, which exchanges the code for a session.
 */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/today");

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent", email };
}
