import type { Sex } from "./types";

/**
 * Dietary Reference Intakes (DRI) — primarily RDAs, with AIs where no RDA
 * is established. Values are per day for healthy, non-pregnant,
 * non-lactating adults.
 *
 * Source: NIH Office of Dietary Supplements fact sheets, which mirror the
 * National Academies' DRI tables. Ranges below match the standard adult
 * age brackets:
 *   - 19–30, 31–50, 51–70, 71+
 * For users under 19 we fall back to the 19–30 band and flag in the UI
 * that the app isn't tuned for minors — this whole app is adult-only per
 * the plan.
 *
 * Units match the Nutrients type (mg for mg, mcg for mcg).
 *
 * NOTE ON IRON: Pre-menopausal women (assumed 19–50 here) need 18 mg/day;
 * post-menopausal (51+) drop to 8 mg/day. This app doesn't ask about
 * menopause status, so we use the age-50 cutoff as a proxy.
 */

export type AgeBand = "19-30" | "31-50" | "51-70" | "71+";

export function ageToBand(ageYears: number): AgeBand {
  if (ageYears < 31) return "19-30";
  if (ageYears < 51) return "31-50";
  if (ageYears < 71) return "51-70";
  return "71+";
}

type DRI = {
  protein_g: number;
  fiber_g: number;
  potassium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  magnesium_mg: number;
  vitamin_a_mcg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
  vitamin_e_mg: number;
  vitamin_k_mcg: number;
  b12_mcg: number;
  folate_mcg: number;
};

/**
 * Male RDAs/AIs. Protein is a per-kg floor in reality (0.8 g/kg); we show
 * the flat RDA here as a default and override in computeGoals when we
 * know the user's weight.
 */
const MALE: Record<AgeBand, DRI> = {
  "19-30": {
    protein_g: 56,
    fiber_g: 38,
    potassium_mg: 3400,
    calcium_mg: 1000,
    iron_mg: 8,
    magnesium_mg: 400,
    vitamin_a_mcg: 900,
    vitamin_c_mg: 90,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 120,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "31-50": {
    protein_g: 56,
    fiber_g: 38,
    potassium_mg: 3400,
    calcium_mg: 1000,
    iron_mg: 8,
    magnesium_mg: 420,
    vitamin_a_mcg: 900,
    vitamin_c_mg: 90,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 120,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "51-70": {
    protein_g: 56,
    fiber_g: 30,
    potassium_mg: 3400,
    calcium_mg: 1000,
    iron_mg: 8,
    magnesium_mg: 420,
    vitamin_a_mcg: 900,
    vitamin_c_mg: 90,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 120,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "71+": {
    protein_g: 56,
    fiber_g: 30,
    potassium_mg: 3400,
    calcium_mg: 1200,
    iron_mg: 8,
    magnesium_mg: 420,
    vitamin_a_mcg: 900,
    vitamin_c_mg: 90,
    vitamin_d_mcg: 20,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 120,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
};

const FEMALE: Record<AgeBand, DRI> = {
  "19-30": {
    protein_g: 46,
    fiber_g: 25,
    potassium_mg: 2600,
    calcium_mg: 1000,
    iron_mg: 18,
    magnesium_mg: 310,
    vitamin_a_mcg: 700,
    vitamin_c_mg: 75,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 90,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "31-50": {
    protein_g: 46,
    fiber_g: 25,
    potassium_mg: 2600,
    calcium_mg: 1000,
    iron_mg: 18,
    magnesium_mg: 320,
    vitamin_a_mcg: 700,
    vitamin_c_mg: 75,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 90,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "51-70": {
    protein_g: 46,
    fiber_g: 21,
    potassium_mg: 2600,
    calcium_mg: 1200,
    iron_mg: 8,
    magnesium_mg: 320,
    vitamin_a_mcg: 700,
    vitamin_c_mg: 75,
    vitamin_d_mcg: 15,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 90,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
  "71+": {
    protein_g: 46,
    fiber_g: 21,
    potassium_mg: 2600,
    calcium_mg: 1200,
    iron_mg: 8,
    magnesium_mg: 320,
    vitamin_a_mcg: 700,
    vitamin_c_mg: 75,
    vitamin_d_mcg: 20,
    vitamin_e_mg: 15,
    vitamin_k_mcg: 90,
    b12_mcg: 2.4,
    folate_mcg: 400,
  },
};

export function getDRI(sex: Sex, ageYears: number): DRI {
  const band = ageToBand(Math.max(19, ageYears));
  // "other" sex falls back to female DRIs as a conservative default —
  // slightly lower calorie anchor, but all vitamin/mineral RDAs are safe.
  if (sex === "male") return MALE[band];
  return FEMALE[band];
}
