/**
 * Tolerable Upper Intake Levels (UL) for nutrients where excess intake
 * carries a known toxicity risk. See plan.md §15 for the user-facing
 * design rationale.
 *
 * Values are the IOM/NIH adult ULs as of early 2026. They differ in
 * spirit from the existing `target` and `ceiling` semantics:
 *   - target  → aim for at least this much
 *   - ceiling → keep below this (soft cap, "Watch" chip)
 *   - upper limit (this module) → going over crosses into a known-harmful
 *                                 range; fires a red "Excess intake"
 *                                 callout, not a Watch.
 *
 * A nutrient can have BOTH a target and a UL — e.g. iron's RDA is 18 mg
 * for adult women, the UL is 45 mg. The safe range is everything in
 * between.
 *
 * v1 caveat — source-restricted ULs.
 *   The IOM ULs for niacin (35 mg), folic acid (1000 mcg), and
 *   supplemental magnesium (350 mg) apply to *added/synthetic/
 *   supplemental* intake only, not the food-source baseline. Our
 *   estimator doesn't distinguish source yet, so we apply the UL to the
 *   total and the callout copy notes that "supplements drive most of
 *   this — food sources alone usually don't reach this level." When
 *   we add an `is_supplement` flag to entry_items the UL math can
 *   switch to summing only supplement-flagged items for these three.
 */

import type { Nutrients, NutrientKey } from "./types";
import { ageFromBirthDate } from "./compute";

/** The fields a UL can be defined for. Subset of NutrientKey by intent. */
export type UpperLimitKey = Extract<
  NutrientKey,
  | "vitamin_a_mcg"
  | "vitamin_d_mcg"
  | "vitamin_e_mg"
  | "b6_mg"
  | "niacin_mg"
  | "folate_mcg"
  | "iron_mg"
  | "zinc_mg"
  | "selenium_mcg"
  | "calcium_mg"
  | "magnesium_mg"
  | "choline_mg"
>;

/**
 * Whether a UL applies to total intake or only to a restricted source
 * (supplements, fortified foods, synthetic forms). Drives the user-
 * facing copy in the Excess callout — see plan.md §15.
 */
export type UpperLimitSource = "total" | "supplemental" | "added";

export type UpperLimitMeta = {
  /** Numeric ceiling (in the unit of the underlying NUTRIENT_LABELS). */
  value: number;
  /** Where the UL applies (see UpperLimitSource). */
  source: UpperLimitSource;
  /** One-line risk hint shown in the Excess callout. */
  risk: string;
};

/**
 * Resolve the UL set for a given user profile. Most ULs are flat for
 * adults; calcium drops at age 51. Anyone under 19 falls back to the
 * adult value here — the under-19 DRI tables aren't loaded yet, and a
 * conservative adult UL is the right safety stance for v1.
 */
export function computeUpperLimits(profile: {
  birth_date: string | null;
}): Partial<Record<UpperLimitKey, UpperLimitMeta>> {
  const age = profile.birth_date ? ageFromBirthDate(profile.birth_date) : 30;
  const calciumUl = age >= 51 ? 2000 : 2500;

  return {
    vitamin_a_mcg: {
      value: 3000,
      source: "total",
      risk:
        "Preformed vitamin A (retinol) above 3,000 mcg/day raises the risk of liver toxicity and, in pregnancy, birth defects. Beta-carotene is not capped.",
    },
    vitamin_d_mcg: {
      value: 100,
      source: "total",
      risk:
        "Vitamin D above 100 mcg (4,000 IU) per day can cause hypercalcemia — high blood calcium, kidney stones, soft-tissue calcification.",
    },
    vitamin_e_mg: {
      value: 1000,
      source: "total",
      risk:
        "Vitamin E above 1,000 mg α-tocopherol per day can interfere with vitamin K and increase bleeding risk.",
    },
    b6_mg: {
      value: 100,
      source: "total",
      risk:
        "Chronic B6 above 100 mg/day causes peripheral neuropathy — numbness or tingling in hands and feet that can persist after stopping.",
    },
    niacin_mg: {
      value: 35,
      source: "added",
      risk:
        "Added niacin (B3) above 35 mg/day causes flushing and, at higher doses, liver toxicity. Niacin from food is not capped — supplements and fortified foods drive almost all of this.",
    },
    folate_mcg: {
      value: 1000,
      source: "added",
      risk:
        "Synthetic folic acid above 1,000 mcg/day can mask vitamin B12 deficiency. Folate from leafy greens and other whole foods is not capped — supplements and fortified grains drive this.",
    },
    iron_mg: {
      value: 45,
      source: "total",
      risk:
        "Iron above 45 mg/day causes GI distress (nausea, constipation) acutely and, with chronic excess, organ damage from iron overload.",
    },
    zinc_mg: {
      value: 40,
      source: "total",
      risk:
        "Zinc above 40 mg/day chronically causes copper deficiency, anemia, and immune suppression.",
    },
    selenium_mcg: {
      value: 400,
      source: "total",
      risk:
        "Selenium above 400 mcg/day causes selenosis — hair loss, brittle nails, GI symptoms.",
    },
    calcium_mg: {
      value: calciumUl,
      source: "total",
      risk:
        age >= 51
          ? "Calcium above 2,000 mg/day (for adults 51+) raises kidney stone and hypercalcemia risk."
          : "Calcium above 2,500 mg/day raises kidney stone and hypercalcemia risk.",
    },
    magnesium_mg: {
      value: 350,
      source: "supplemental",
      risk:
        "Supplemental magnesium above 350 mg/day causes diarrhea and cramping. Magnesium from food is not capped — supplements drive this.",
    },
    choline_mg: {
      value: 3500,
      source: "total",
      risk:
        "Choline above 3,500 mg/day can cause low blood pressure, fishy body odor, sweating, and GI distress.",
    },
  };
}

/**
 * Convenience: project a UpperLimits map down to a Partial<Nutrients>
 * shape (key → numeric ceiling) for callers that only care about the
 * numbers. Used by computeExcesses to avoid threading the full meta
 * map through the comparison loop.
 */
export function upperLimitValues(
  uls: Partial<Record<UpperLimitKey, UpperLimitMeta>>,
): Partial<Nutrients> {
  const out: Partial<Nutrients> = {};
  for (const [k, meta] of Object.entries(uls) as Array<
    [UpperLimitKey, UpperLimitMeta]
  >) {
    out[k] = meta.value;
  }
  return out;
}
