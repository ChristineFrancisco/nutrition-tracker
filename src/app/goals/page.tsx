import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getLatestGoals } from "@/lib/profile";
import {
  NUTRIENT_LABELS,
  NUTRIENT_SEMANTICS,
  type NutrientKey,
} from "@/lib/targets/types";
import { switchToGeneric } from "./actions";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/onboarding");

  const goals = await getLatestGoals();
  if (!goals) redirect("/onboarding");

  const params = await searchParams;
  const justSaved = params.saved === "1";

  const modeLabel =
    profile.target_mode === "generic"
      ? "FDA generic (2,000 kcal reference)"
      : "Personalized (DRI-based)";

  const groups: { title: string; keys: NutrientKey[] }[] = [
    {
      title: "Energy & macros",
      // sugar_g intentionally omitted — no FDA/DRI target for total sugar.
      keys: [
        "calories_kcal",
        "protein_g",
        "carbs_g",
        "fat_g",
        "saturated_fat_g",
        "trans_fat_g",
        "fiber_g",
        "added_sugar_g",
        "cholesterol_mg",
      ],
    },
    {
      title: "Minerals",
      keys: [
        "sodium_mg",
        "potassium_mg",
        "calcium_mg",
        "iron_mg",
        "magnesium_mg",
        "zinc_mg",
        "phosphorus_mg",
        "copper_mg",
        "selenium_mcg",
        "manganese_mg",
      ],
    },
    {
      title: "Vitamins",
      keys: [
        "vitamin_a_mcg",
        "vitamin_c_mg",
        "vitamin_d_mcg",
        "vitamin_e_mg",
        "vitamin_k_mcg",
        "b12_mcg",
        "folate_mcg",
        "thiamin_mg",
        "riboflavin_mg",
        "niacin_mg",
        "b6_mg",
        "choline_mg",
      ],
    },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your daily targets</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Source: <span className="font-medium">{modeLabel}</span>
          </p>
          {profile.target_mode === "personalized" ? (
            <form action={switchToGeneric} className="mt-3">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              >
                Switch to FDA generic →
              </button>
            </form>
          ) : (
            <Link
              href="/profile"
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Switch to personalized →
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/profile"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Edit profile
          </Link>
          <Link
            href="/today"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Today
          </Link>
        </div>
      </header>

      {justSaved && (
        <div className="mb-6 rounded-lg bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
          Targets recomputed from your profile.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.title}
            className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {group.title}
            </h2>
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {group.keys.map((k) => {
                const meta = NUTRIENT_LABELS[k];
                const semantic = NUTRIENT_SEMANTICS[k];
                const value = goals[k];
                return (
                  <div
                    key={k}
                    className="flex items-baseline justify-between py-2"
                  >
                    <dt className="text-sm">
                      {meta.label}
                      {semantic === "ceiling" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          limit
                        </span>
                      )}
                    </dt>
                    <dd className="font-mono text-sm">
                      {formatNumber(value)} {meta.unit}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      <footer className="mt-8 text-xs text-zinc-400">
        Numbers with a <span className="font-medium">limit</span> tag are
        ceilings — stay under these. All other values are targets to hit.
      </footer>
    </main>
  );
}

function formatNumber(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
