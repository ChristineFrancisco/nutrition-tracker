"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfile, type ProfileFormState } from "./actions";
import type {
  ActivityLevel,
  ProfileForGoals,
} from "@/lib/targets/types";

const initialState: ProfileFormState = { status: "idle" };

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] =
  [
    { value: "sedentary", label: "Sedentary", hint: "Desk job, little exercise" },
    { value: "light", label: "Light", hint: "Light exercise 1–3 days/week" },
    { value: "moderate", label: "Moderate", hint: "Moderate exercise 3–5 days/week" },
    { value: "active", label: "Active", hint: "Hard exercise 6–7 days/week" },
    { value: "very_active", label: "Very active", hint: "Hard daily training or physical job" },
  ];

function SubmitButton({ isFirstRun }: { isFirstRun: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving…"
        : isFirstRun
          ? "Compute my targets"
          : "Save and recompute targets"}
    </button>
  );
}

export default function ProfileForm({
  initial,
  isFirstRun,
}: {
  initial: ProfileForGoals;
  isFirstRun: boolean;
}) {
  const [state, formAction] = useActionState(saveProfile, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {/* Filling in this form always switches to personalized mode —
          entering your real data is the signal that you want DRI-based
          targets. Users can switch back to FDA generic from /goals. */}
      <input type="hidden" name="target_mode" value="personalized" />

      <fieldset className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <legend className="px-2 text-sm font-medium">Required</legend>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Biological sex</span>
          <select
            name="sex"
            required
            defaultValue={initial.sex ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other / prefer not to say</option>
          </select>
          <span className="text-xs text-zinc-500">
            Used for RDAs and the BMR formula.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Date of birth</span>
          <input
            type="date"
            name="birth_date"
            required
            defaultValue={initial.birth_date ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <span className="text-xs text-zinc-500">
            Age bracket determines several vitamin and mineral targets.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <legend className="px-2 text-sm font-medium">
          Optional — improves calorie accuracy
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Height (cm)</span>
            <input
              type="number"
              name="height_cm"
              min={50}
              max={260}
              step={0.5}
              defaultValue={initial.height_cm ?? ""}
              placeholder="e.g. 170"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Weight (kg)</span>
            <input
              type="number"
              name="weight_kg"
              min={20}
              max={400}
              step={0.1}
              defaultValue={initial.weight_kg ?? ""}
              placeholder="e.g. 70"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Activity level</span>
          <select
            name="activity_level"
            defaultValue={initial.activity_level ?? "moderate"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-zinc-500">
          If you skip height, weight, or activity, we&apos;ll use a generic
          calorie estimate for your age and sex.
        </p>
      </fieldset>

      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton isFirstRun={isFirstRun} />
      </div>
    </form>
  );
}
