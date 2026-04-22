import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { pickTargetMode } from "./actions";

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.onboarded_at) redirect("/today");

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <header className="mb-8 space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          Welcome
        </p>
        <h1 className="text-2xl font-semibold">How should we set your daily targets?</h1>
        <p className="text-sm text-zinc-500">
          You can switch this later in Settings.
        </p>
      </header>

      <div className="space-y-4">
        <OptionCard
          title="Generic — FDA Daily Values"
          description="The one-size-fits-all numbers printed on nutrition labels. No personal info required, based on a 2,000 kcal reference diet. Fastest way to start."
          mode="generic"
          cta="Use FDA defaults"
        />
        <OptionCard
          title="Personalized — based on you"
          description="Enter your age, biological sex, and (optionally) height, weight, and activity level. We compute targets from Dietary Reference Intakes (DRIs), which vary by age and sex."
          mode="personalized"
          cta="Personalize my targets"
        />
      </div>
    </main>
  );
}

function OptionCard({
  title,
  description,
  mode,
  cta,
}: {
  title: string;
  description: string;
  mode: "generic" | "personalized";
  cta: string;
}) {
  return (
    <form
      action={pickTargetMode}
      className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-brand-500 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="mode" value={mode} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>
      <button
        type="submit"
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        {cta}
      </button>
    </form>
  );
}
