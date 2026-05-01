import { FDA_DAILY_VALUES } from "./fda";
import { getDRI } from "./dri";
import type {
  ActivityLevel,
  CompositionFocus,
  Nutrients,
  ProfileForGoals,
  Sex,
} from "./types";

/**
 * Energy density of body fat in kcal/kg. The textbook approximation;
 * the real number varies ±10% in the literature depending on whose
 * tissue you sample and how you measure it. 7700 is the most-cited
 * round figure (it's also what 3500 kcal/lb resolves to per kg).
 *
 * We use this to translate "lose X kg/week" into a daily kcal delta
 * against TDEE: kcal/day = kg/week × 7700 / 7 = kg/week × 1100.
 */
const KCAL_PER_KG_BODY_FAT = 7700;

/**
 * Protein g/kg scaling per composition focus. Sourced from ISSN 2017
 * position stand on protein for athletes:
 *   - preserve (cutting): 1.6 g/kg keeps lean mass while in deficit
 *   - recomp (recomposition): 2.0 g/kg supports simultaneous fat loss
 *     and muscle gain in trained individuals
 *   - build (bulking): 2.0 g/kg is enough; higher saturates returns
 *
 * Applied only to the personalized path. Generic mode uses the FDA DV.
 */
const PROTEIN_PER_KG: Record<CompositionFocus, number> = {
  preserve: 1.6,
  recomp: 2.0,
  build: 2.0,
};

/**
 * Fat as fraction of calories per composition focus. Pulled down from
 * the standard 30% to make room for the higher protein in recomp/build
 * plans without leaving carbs absurdly low. Preserve-the-baseline keeps
 * 27% to soften the cut.
 */
const FAT_FRACTION: Record<CompositionFocus, number> = {
  preserve: 0.27,
  recomp: 0.25,
  build: 0.25,
};

/**
 * Mifflin–St Jeor basal metabolic rate (BMR). Most widely used modern
 * equation; ~10% more accurate than Harris-Benedict for adults.
 *
 *   men:   BMR = 10·weight + 6.25·height − 5·age + 5
 *   women: BMR = 10·weight + 6.25·height − 5·age − 161
 *
 * "other" sex uses the average of male/female constants (−78) as a
 * middle-ground default. This is imprecise; the user can switch to
 * generic mode if that feels wrong.
 */
export function mifflinStJeorBmr(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base - 78;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Estimated Energy Requirement fallback used when we don't have
 * height/weight/activity. Rough averages from the DRI tables for a
 * moderately active adult at median adult weight. Not precise —
 * the profile form encourages entering real values.
 */
function fallbackCalories(sex: Sex, ageYears: number): number {
  if (sex === "male") {
    if (ageYears < 31) return 2600;
    if (ageYears < 51) return 2400;
    return 2200;
  }
  if (sex === "female") {
    if (ageYears < 31) return 2000;
    if (ageYears < 51) return 1900;
    return 1750;
  }
  // "other"
  return 2100;
}

export function ageFromBirthDate(
  isoDate: string,
  today: Date = new Date()
): number {
  const birth = new Date(isoDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

/**
 * Main entry point: turn a profile row into a full Nutrients target.
 * Always returns a complete object — missing profile fields trigger
 * sensible fallbacks rather than leaving nulls to propagate.
 */
export function computeGoals(profile: ProfileForGoals): Nutrients {
  if (profile.target_mode === "generic") {
    // Generic mode: FDA Daily Values as-is. No profile required.
    return { ...FDA_DAILY_VALUES };
  }

  // Personalized + custom modes. Sex + birth_date are collected on
  // the form. Height / weight / activity are optional — we fall back
  // when missing.
  const isCustom = profile.target_mode === "custom";
  const sex: Sex = profile.sex ?? "other";
  const age = profile.birth_date ? ageFromBirthDate(profile.birth_date) : 30;
  const activity: ActivityLevel = profile.activity_level ?? "moderate";
  // Composition focus only applies in custom (goal-coach) mode. DRI
  // minimums use a sensible default ("preserve") so the protein scalar
  // is reasonable for someone who hasn't opted into coaching.
  const focus: CompositionFocus = isCustom
    ? (profile.composition_focus ?? "preserve")
    : "preserve";

  // TDEE — total daily energy expenditure. The maintenance baseline.
  let tdee: number;
  if (profile.weight_kg && profile.height_cm) {
    const bmr = mifflinStJeorBmr(
      sex,
      profile.weight_kg,
      profile.height_cm,
      age
    );
    tdee = Math.round(bmr * ACTIVITY_MULTIPLIER[activity]);
  } else {
    tdee = fallbackCalories(sex, age);
  }

  // Goal coach: apply a daily kcal delta from the user's chosen weight-
  // change rate. Only applies in custom mode — DRI minimums always use
  // the maintenance TDEE.
  //
  // Negative for losing, positive for gaining. The DB check constraint
  // already clamps weekly_change_kg to [-1.0, 0.5]; we floor the
  // resulting target at 1200 kcal as a safety net so a misconfigured
  // profile can never produce a clinically dangerous target (1200 is
  // a common minimum for adult women; men can go a bit higher but
  // 1200 is a fine global floor).
  const weeklyChangeKg = isCustom ? (profile.weekly_change_kg ?? 0) : 0;
  const dailyDelta = Math.round(
    (weeklyChangeKg * KCAL_PER_KG_BODY_FAT) / 7,
  );
  const calories = Math.max(1200, tdee + dailyDelta);

  // Protein — composition-aware. Falls back to the DRI when we have no
  // body weight to scale against; that's mostly the "user hasn't filled
  // out their profile yet" case.
  const protein_g = profile.weight_kg
    ? Math.round(profile.weight_kg * PROTEIN_PER_KG[focus])
    : getDRI(sex, age).protein_g;

  const fat_g = Math.round((calories * FAT_FRACTION[focus]) / 9);
  const carbs_g = Math.round(
    (calories - protein_g * 4 - fat_g * 9) / 4 // fill remainder
  );

  const saturated_fat_g = Math.round((calories * 0.1) / 9); // <10% of cals
  const added_sugar_g = Math.round((calories * 0.1) / 4);   // <10% of cals
  const fiber_g = Math.round((calories / 1000) * 14);       // 14 g / 1000 kcal

  const dri = getDRI(sex, age);

  return {
    calories_kcal: calories,
    protein_g,
    carbs_g,
    fat_g,
    saturated_fat_g,
    trans_fat_g: 0,
    fiber_g,
    sugar_g: 0, // no DRI/FDA target for total sugar; tracked for reporting only
    added_sugar_g,
    cholesterol_mg: 300, // FDA DV ceiling; no personalized DRI exists
    sodium_mg: 2300, // AHA/FDA ceiling, same for all adults
    potassium_mg: dri.potassium_mg,
    calcium_mg: dri.calcium_mg,
    iron_mg: dri.iron_mg,
    magnesium_mg: dri.magnesium_mg,
    zinc_mg: dri.zinc_mg,
    phosphorus_mg: dri.phosphorus_mg,
    copper_mg: dri.copper_mg,
    selenium_mcg: dri.selenium_mcg,
    manganese_mg: dri.manganese_mg,
    vitamin_a_mcg: dri.vitamin_a_mcg,
    vitamin_c_mg: dri.vitamin_c_mg,
    vitamin_d_mcg: dri.vitamin_d_mcg,
    vitamin_e_mg: dri.vitamin_e_mg,
    vitamin_k_mcg: dri.vitamin_k_mcg,
    b12_mcg: dri.b12_mcg,
    folate_mcg: dri.folate_mcg,
    thiamin_mg: dri.thiamin_mg,
    riboflavin_mg: dri.riboflavin_mg,
    niacin_mg: dri.niacin_mg,
    b6_mg: dri.b6_mg,
    choline_mg: dri.choline_mg,
  };
}
