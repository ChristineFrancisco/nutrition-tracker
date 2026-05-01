"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompositionFocus, GoalKind } from "@/lib/targets/types";
import { saveGoalCoach } from "./actions";

/**
 * Goal coach: pick a direction (lose / maintain / gain), set the weekly
 * rate (or compute it from a target weight + date), and pick a body-
 * composition focus. The component shows a live calorie + macro preview
 * computed in the browser so the user can dial things in before saving.
 *
 * Why a client component: the preview needs to react to slider /
 * dropdown changes without a server round-trip. The math here mirrors
 * the server-side `computeGoals` for the personalized branch — kept
 * intentionally short and re-derivable, so we don't ship the full
 * compute module to the client. Saving still goes through the server
 * action where the canonical math runs and the result is snapshotted
 * into daily_goals.
 *
 * Display unit: lbs/week for the rate. We store kg internally because
 * the DB column is kg and converting once at save time is cheaper than
 * converting on every render.
 */

const KCAL_PER_KG = 7700;
const KG_PER_LB = 0.45359237;
const PROTEIN_PER_KG: Record<CompositionFocus, number> = {
  preserve: 1.6,
  recomp: 2.0,
  build: 2.0,
};
const FAT_FRACTION: Record<CompositionFocus, number> = {
  preserve: 0.27,
  recomp: 0.25,
  build: 0.25,
};

const RATE_OPTIONS_LB_PER_WEEK = [0.25, 0.5, 0.75, 1.0];

export default function GoalCoach({
  initial,
}: {
  initial: {
    goal_kind: GoalKind;
    weekly_change_kg: number;
    composition_focus: CompositionFocus;
    /** Maintenance TDEE — used to ground the live preview. Server has
     *  already computed this from BMR × activity multiplier. */
    tdee_kcal: number;
    /** User's current weight in kg, for protein scaling and the
     *  target-weight calculator. May be null if profile is incomplete. */
    weight_kg: number | null;
  };
}) {
  const [goalKind, setGoalKind] = useState<GoalKind>(initial.goal_kind);
  const [focus, setFocus] = useState<CompositionFocus>(
    initial.composition_focus,
  );
  // Rate is held internally in lbs/week (positive number). The sign is
  // applied at save time based on goalKind.
  const initialLb = Math.round(
    Math.abs(initial.weekly_change_kg / KG_PER_LB) * 100,
  ) / 100;
  const [rateLb, setRateLb] = useState<number>(
    RATE_OPTIONS_LB_PER_WEEK.includes(initialLb) ? initialLb : 0.5,
  );

  // Target-weight calculator state — optional, only used to populate
  // rateLb when the user wants to express their goal as a deadline.
  const [targetLb, setTargetLb] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");

  const weightKg = initial.weight_kg ?? 70;
  const currentLb = Math.round((weightKg / KG_PER_LB) * 10) / 10;

  // When goalKind flips to maintain, force the rate display to 0 so the
  // preview doesn't show a deficit/surplus that won't actually be saved.
  const effectiveRateLb = goalKind === "maintain" ? 0 : rateLb;
  const signedKgPerWeek =
    goalKind === "lose"
      ? -effectiveRateLb * KG_PER_LB
      : goalKind === "gain"
        ? +effectiveRateLb * KG_PER_LB
        : 0;

  const preview = useMemo(() => {
    const dailyDelta = Math.round((signedKgPerWeek * KCAL_PER_KG) / 7);
    const calories = Math.max(1200, initial.tdee_kcal + dailyDelta);
    const proteinG = Math.round(weightKg * PROTEIN_PER_KG[focus]);
    const fatG = Math.round((calories * FAT_FRACTION[focus]) / 9);
    const carbsG = Math.max(
      0,
      Math.round((calories - proteinG * 4 - fatG * 9) / 4),
    );
    return { calories, dailyDelta, proteinG, fatG, carbsG };
  }, [signedKgPerWeek, initial.tdee_kcal, weightKg, focus]);

  const warnings = useMemo(
    () =>
      computeWarnings({
        goalKind,
        focus,
        rateLb: effectiveRateLb,
        weightKg,
        tdee: initial.tdee_kcal,
        calories: preview.calories,
        dailyDelta: preview.dailyDelta,
        weightKnown: initial.weight_kg !== null,
      }),
    [
      goalKind,
      focus,
      effectiveRateLb,
      weightKg,
      initial.tdee_kcal,
      initial.weight_kg,
      preview.calories,
      preview.dailyDelta,
    ],
  );

  // Reflect target-weight changes back into the rate slider. Runs only
  // when both target inputs are populated and parseable; otherwise the
  // slider stays as-is so the user can switch back to direct rate
  // editing without losing their selection.
  useEffect(() => {
    if (!targetLb || !targetDate) return;
    const target = Number(targetLb);
    const targetDt = new Date(targetDate);
    if (!Number.isFinite(target) || Number.isNaN(targetDt.getTime())) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (targetDt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays <= 0) return;
    const diffLb = target - currentLb;
    if (diffLb === 0) {
      setGoalKind("maintain");
      return;
    }
    setGoalKind(diffLb < 0 ? "lose" : "gain");
    const lbPerWeek = (Math.abs(diffLb) / diffDays) * 7;
    // Snap to the nearest defined rate so the preview maps to a slider
    // position cleanly.
    const snapped = nearest(RATE_OPTIONS_LB_PER_WEEK, lbPerWeek);
    setRateLb(snapped);
  }, [targetLb, targetDate, currentLb]);

  // Input mode: which inputs the user is using to define the rate.
  //   "rate"    → rate quick-picks + composition focus cards
  //   "target"  → target weight + target date; system back-computes the
  //               rate and auto-picks a focus from direction
  // We don't persist the input mode across saves — every visit starts
  // in rate mode. The user is one tap from switching if they prefer
  // the target-weight calculator.
  const [inputMode, setInputMode] = useState<"rate" | "target">("rate");

  // Auto-pick focus from direction when in target mode. Lose →
  // preserve (keep muscle while cutting); gain → build; maintain →
  // preserve. Only writes when inputMode is "target" so the user's
  // explicit pick in rate mode stays sticky if they swap modes.
  useEffect(() => {
    if (inputMode !== "target") return;
    setFocus(
      goalKind === "gain" ? "build" : "preserve",
    );
  }, [inputMode, goalKind]);

  // Short summary text for the collapsed disclosure.
  const summary =
    goalKind === "maintain"
      ? "Maintenance · no calorie delta"
      : `${goalKind === "lose" ? "Lose" : "Gain"} ${effectiveRateLb} lb/week · ${
          focus === "preserve"
            ? "Preserve muscle"
            : focus === "recomp"
              ? "Recomposition"
              : "Build muscle"
        }`;

  return (
    <details
      className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      open={initial.weekly_change_kg === 0}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 transition hover:bg-zinc-50 group-open:border-b group-open:border-zinc-200 dark:hover:bg-zinc-800/40 dark:group-open:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Goal coach
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {summary}
          </p>
        </div>
        <span
          aria-hidden
          className="text-zinc-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <form action={saveGoalCoach} className="p-4 pt-0">
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Set a direction and either pick a rate manually or give us a
          target weight + date — we&apos;ll back-solve the rate.
        </p>

      {/* Direction */}
      <fieldset className="mt-4">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Direction
        </legend>
        <div className="mt-2 inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          {(["lose", "maintain", "gain"] as GoalKind[]).map((kind) => (
            <label key={kind} className="cursor-pointer">
              <input
                type="radio"
                name="goal_kind_ui"
                value={kind}
                checked={goalKind === kind}
                onChange={() => setGoalKind(kind)}
                className="sr-only"
              />
              <span
                className={`block rounded-md px-3 py-1.5 transition ${
                  goalKind === kind
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {kind === "lose"
                  ? "Lose weight"
                  : kind === "gain"
                    ? "Gain weight"
                    : "Maintain"}
              </span>
            </label>
          ))}
        </div>
        {/* Hidden form value so the server action sees the chosen kind. */}
        <input type="hidden" name="goal_kind" value={goalKind} />
      </fieldset>

      {/* How they want to express the rate */}
      {goalKind !== "maintain" && (
        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            How to set your rate
          </legend>
          <div className="mt-2 inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950">
            {(
              [
                { id: "rate", label: "By rate + focus" },
                { id: "target", label: "By target weight + date" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setInputMode(opt.id)}
                className={`rounded-md px-3 py-1 transition ${
                  inputMode === opt.id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Rate quick-picks (rate-mode only) */}
      {goalKind !== "maintain" && inputMode === "rate" && (
        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Rate
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {RATE_OPTIONS_LB_PER_WEEK.map((opt) => (
              <label key={opt} className="cursor-pointer">
                <input
                  type="radio"
                  name="rate_ui"
                  value={opt}
                  checked={rateLb === opt}
                  onChange={() => setRateLb(opt)}
                  className="sr-only"
                />
                <span
                  className={`block rounded-full border px-3 py-1 text-xs font-medium transition ${
                    rateLb === opt
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400/60 dark:bg-emerald-500/15 dark:text-emerald-200"
                      : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {opt} lb/week
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Target weight + date (target-mode only) */}
      {goalKind !== "maintain" && inputMode === "target" && (
        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Target weight + date
          </legend>
          <div className="mt-2 flex flex-wrap items-end gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <label className="flex flex-col">
              Target weight (lb)
              <input
                type="number"
                step="0.1"
                value={targetLb}
                onChange={(e) => setTargetLb(e.target.value)}
                placeholder={String(currentLb)}
                className="mt-1 w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col">
              Target date
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-400">
            We back-solve the weekly rate (snapped to the nearest 0.25 lb)
            and pick a sensible composition focus from your direction.
            {initial.weight_kg
              ? null
              : " Add your current weight in your profile for an accurate calculation."}
          </p>
        </fieldset>
      )}

      {/* Composition focus — rate-mode only. Target-mode auto-picks
          based on direction (lose → preserve, gain → build). */}
      {inputMode === "rate" && (
        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Body-composition focus
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <FocusCard
              value="preserve"
              current={focus}
              label="Preserve"
              sub="Keep muscle while cutting"
              note="Protein 1.6 g/kg"
              onSelect={() => setFocus("preserve")}
            />
            <FocusCard
              value="recomp"
              current={focus}
              label="Recomp"
              sub="Lose fat + gain muscle"
              note="Protein 2.0 g/kg"
              onSelect={() => setFocus("recomp")}
            />
            <FocusCard
              value="build"
              current={focus}
            label="Build"
            sub="Bulk + lift"
            note="Protein 2.0 g/kg"
            onSelect={() => setFocus("build")}
          />
        </div>
        </fieldset>
      )}
      {/* The composition focus always submits — auto-picked in target
          mode, manually picked in rate mode. Sits outside the fieldset
          so the hidden input is present even when the cards aren't
          rendered. */}
      <input type="hidden" name="composition_focus" value={focus} />

      {/* Live preview */}
      <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-700/40 dark:bg-emerald-500/10">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
          Suggested
        </p>
        <p className="mt-1 font-mono text-base tabular-nums text-emerald-900 dark:text-emerald-100">
          {preview.calories.toLocaleString()} kcal
          {preview.dailyDelta !== 0 && (
            <span className="ml-2 text-xs font-normal text-emerald-700/80 dark:text-emerald-300/80">
              {preview.dailyDelta > 0 ? "+" : ""}
              {preview.dailyDelta} vs. maintenance
            </span>
          )}
        </p>
        <p className="mt-1 font-mono text-sm tabular-nums text-emerald-900/90 dark:text-emerald-100/90">
          P {preview.proteinG} g · C {preview.carbsG} g · F {preview.fatG} g
        </p>
      </div>

      {/* Hidden field that carries the signed kg/week to the server. */}
      <input
        type="hidden"
        name="weekly_change_kg"
        value={signedKgPerWeek.toFixed(4)}
      />

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={
                w.severity === "warning"
                  ? "rounded-md border border-red-300 bg-red-50/70 p-3 text-xs leading-snug text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
                  : "rounded-md border border-amber-300 bg-amber-50/70 p-3 text-xs leading-snug text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
              }
            >
              <p className="font-semibold">
                <span aria-hidden className="mr-1">
                  {w.severity === "warning" ? "✕" : "!"}
                </span>
                {w.title}
              </p>
              <p className="mt-0.5">{w.body}</p>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">
          Why these numbers?
        </summary>
        <div className="mt-2 space-y-1 pl-1">
          <p>
            <strong>Calories:</strong> Mifflin–St Jeor BMR × activity gives
            your maintenance estimate (TDEE). The deficit / surplus comes
            from your weekly rate × ~7,700 kcal/kg of body fat ÷ 7 days.
            Floored at 1,200 kcal as a safety minimum.
          </p>
          <p>
            <strong>Protein:</strong> {PROTEIN_PER_KG[focus]} g per kg of
            body weight. ISSN 2017 position stand: 1.6–2.2 g/kg supports
            muscle preservation in a deficit and muscle gain when training.
          </p>
          <p>
            <strong>Fat / carbs:</strong> Fat is{" "}
            {(FAT_FRACTION[focus] * 100).toFixed(0)}% of calories; carbs
            fill the remainder. Lower fat in recomp/build leaves room for
            the higher protein without dropping carbs unsustainably.
          </p>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          Save goal
        </button>
      </div>
      </form>
    </details>
  );
}

/**
 * Sibling form that always posts a maintenance reset (goal_kind=maintain,
 * weekly_change_kg=0). Rendered next to GoalCoach in the page so the
 * "Reset" affordance keeps working without JS — it's a real form post,
 * not a client-side patch.
 */
export function ResetToMaintenanceForm({
  composition_focus,
}: {
  composition_focus: CompositionFocus;
}) {
  return (
    <form action={saveGoalCoach} className="mt-2 flex justify-end">
      <input type="hidden" name="goal_kind" value="maintain" />
      <input type="hidden" name="weekly_change_kg" value="0" />
      {/* Composition focus stays at whatever the user last picked —
          they probably still want the same protein scalar even on
          maintenance. If they want to wipe it too, picking "preserve"
          and clicking Save is one extra tap. */}
      <input
        type="hidden"
        name="composition_focus"
        value={composition_focus}
      />
      <button
        type="submit"
        className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
      >
        Reset to maintenance
      </button>
    </form>
  );
}

function FocusCard({
  value,
  current,
  label,
  sub,
  note,
  onSelect,
}: {
  value: CompositionFocus;
  current: CompositionFocus;
  label: string;
  sub: string;
  note: string;
  onSelect: () => void;
}) {
  const active = current === value;
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name="composition_focus_ui"
        value={value}
        checked={active}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={`block rounded-lg border p-3 text-left transition ${
          active
            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400/60 dark:bg-emerald-500/10"
            : "border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        }`}
      >
        <span
          className={`block text-sm font-semibold ${
            active
              ? "text-emerald-800 dark:text-emerald-200"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">
          {sub}
        </span>
        <span className="mt-1 block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {note}
        </span>
      </span>
    </label>
  );
}

type Warning = {
  severity: "caution" | "warning";
  title: string;
  body: string;
};

/**
 * Surface safety hints when the user's chosen rate / focus combination
 * crosses well-established thresholds in the nutrition / exercise-
 * science literature. We surface a mix of hard "this is unsafe" warnings
 * (red) and softer "this will be hard" cautions (amber). All copy is
 * tuned to be non-shaming and to suggest a milder alternative rather
 * than blocking the save — the user is in charge.
 *
 * Thresholds, with sources:
 *   - 1,200 kcal floor: long-standing minimum cited by FDA / mainstream
 *     nutrition references for adult women; men typically 1,500. We
 *     use 1,200 as a global floor and warn when it kicks in.
 *   - >25% deficit vs. TDEE: literature on muscle preservation in
 *     deficit (Helms 2014 review, Murphy & Koehler 2022) finds rapid
 *     muscle / metabolic costs above ~25%.
 *   - >1% body weight per week loss: Helms et al 2014 position stand
 *     on natural physique athletes; >1%/week is reserved for higher
 *     body-fat starting points.
 *   - Build + lose: simultaneous fat loss + muscle gain ("recomp") is
 *     possible but mostly only for beginners or post-detraining. Pure
 *     "build muscle" + "calorie deficit" is contradictory; we suggest
 *     the recomp focus instead.
 *   - >20% surplus when gaining: Iraki et al 2019 — most muscle-gain
 *     research finds diminishing returns past 10–15% surplus.
 */
function computeWarnings(input: {
  goalKind: GoalKind;
  focus: CompositionFocus;
  rateLb: number;
  weightKg: number;
  tdee: number;
  calories: number;
  dailyDelta: number;
  weightKnown: boolean;
}): Warning[] {
  const out: Warning[] = [];

  // 1. Calorie floor hit. Strongest signal — the math wanted to go
  // lower than 1,200 but we clamped.
  if (input.calories === 1200 && input.dailyDelta < 0 && input.tdee + input.dailyDelta < 1200) {
    out.push({
      severity: "warning",
      title: "Below 1,200 kcal floor",
      body: "Your target hit the safety floor. That usually means the rate is too fast for your body — try a slower rate, or check your weight + height in your profile if those changed.",
    });
  }

  // 2. Deficit depth as % of TDEE.
  if (input.goalKind === "lose" && input.tdee > 0) {
    const deficitPct = Math.abs(input.dailyDelta) / input.tdee;
    if (deficitPct > 0.25) {
      out.push({
        severity: "warning",
        title: "Aggressive deficit",
        body: `That's about ${Math.round(deficitPct * 100)}% below maintenance. Sustained deficits over 25% are linked to faster muscle loss and stronger metabolic adaptation. A 10–20% deficit is usually more sustainable.`,
      });
    } else if (deficitPct > 0.20) {
      out.push({
        severity: "caution",
        title: "Steep deficit",
        body: `~${Math.round(deficitPct * 100)}% below maintenance. Achievable, but harder to stick to than a 10–20% deficit and more likely to cost lean mass.`,
      });
    }
  }

  // 3. Rate as % of body weight per week. Only fires when we actually
  // know the user's weight — a 70 kg default would mis-warn.
  if (
    input.goalKind === "lose" &&
    input.weightKnown &&
    input.weightKg > 0 &&
    input.rateLb > 0
  ) {
    const ratePctOfBw = (input.rateLb * 0.4536) / input.weightKg;
    if (ratePctOfBw > 0.01) {
      out.push({
        severity: "caution",
        title: "Fast for your body weight",
        body: `That's ~${(ratePctOfBw * 100).toFixed(1)}% of your body weight per week. Loss rates above 1% are typically reserved for higher-body-fat starting points; expect more muscle loss otherwise.`,
      });
    }
  }

  // 4. Build + lose. Physiologically unusual.
  if (input.goalKind === "lose" && input.focus === "build") {
    out.push({
      severity: "caution",
      title: "Build + lose at the same time is hard",
      body: "Building muscle while in a calorie deficit usually only works for beginners or after a long break from training. The 'Recomp' focus is closer to what the literature supports for this combination.",
    });
  }

  // 5. Aggressive gain.
  if (input.goalKind === "gain" && input.tdee > 0) {
    const surplusPct = input.dailyDelta / input.tdee;
    if (surplusPct > 0.20) {
      out.push({
        severity: "caution",
        title: "Steep surplus",
        body: `~${Math.round(surplusPct * 100)}% above maintenance. Most muscle-gain research finds diminishing returns past ~10–15% surplus — the extra mostly goes to fat.`,
      });
    }
  }

  return out;
}

function nearest(options: number[], v: number): number {
  let best = options[0];
  let bestDiff = Math.abs(v - best);
  for (const o of options) {
    const d = Math.abs(v - o);
    if (d < bestDiff) {
      best = o;
      bestDiff = d;
    }
  }
  return best;
}
