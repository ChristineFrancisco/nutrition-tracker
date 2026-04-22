import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const params = await searchParams;
  const isFirstRun = params.new === "1" || !profile.onboarded_at;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {isFirstRun ? "Tell us about you" : "Edit profile"}
          </h1>
          <p className="text-sm text-zinc-500">
            {isFirstRun
              ? "These values personalize your daily targets."
              : "Updating these recomputes your daily targets."}
          </p>
        </div>
        {!isFirstRun && (
          <Link
            href="/today"
            className="text-sm text-zinc-500 underline-offset-2 hover:underline"
          >
            Back to today
          </Link>
        )}
      </header>

      <ProfileForm
        initial={{
          target_mode: profile.target_mode,
          sex: profile.sex,
          birth_date: profile.birth_date,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          activity_level: profile.activity_level,
        }}
        isFirstRun={isFirstRun}
      />
    </main>
  );
}
