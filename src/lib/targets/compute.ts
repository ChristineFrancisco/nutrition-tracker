import { FDA_DAILY_VALUES } from "./fda";
import { getDRI } from "./dri";
import type {
  ActivityLevel,
  Nutrients,
  ProfileForGoals,
  Sex,
} from "./types";

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

  // Personalized mode. Sex + birth_date are collected on the form.
  // Height / weight / activity are optional — we fall back when missing.
  const sex: Sex = profile.sex ?? "other";
  const age = profile.birth_date ? ageFromBirthDate(profile.birth_date) : 30;
  const activity: ActivityLevel = profile.activity_level ?? "moderate";

  // Calories
  let calories: number;
  if (profile.weight_kg && profile.height_cm) {
    const bmr = mifflinStJeorBmr(
      sex,
      profile.weight_kg,
      profile.height_cm,
      age
    );
    calories = Math.round(bmr * ACTIVITY_MULTIPLIER[activity]);
  } else {
    calories = fallbackCalories(sex, age);
  }

  // Macros — percent-of-calories splits with common defaults.
  const protein_g = profile.weight_kg
    ? Math.round(
        profile.weight_kg *
          (activity === "active" || activity === "very_active" ? 1.2 : 0.8)
      )
    : getDRI(sex, age).protein_g;

  const fat_g = Math.round((calories * 0.3) / 9); // 30% of calories; 9 kcal/g
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
    sodium_mg: 2300, // AHA/FDA ceiling, same for all adults
    potassium_mg: dri.potassium_mg,
    calcium_mg: dri.calcium_mg,
    iron_mg: dri.iron_mg,
    magnesium_mg: dri.magnesium_mg,
    vitamin_a_mcg: dri.vitamin_a_mcg,
    vitamin_c_mg: dri.vitamin_c_mg,
    vitamin_d_mcg: dri.vitamin_d_mcg,
    vitamin_e_mg: dri.vitamin_e_mg,
    vitamin_k_mcg: dri.vitamin_k_mcg,
    b12_mcg: dri.b12_mcg,
    folate_mcg: dri.folate_mcg,
  };
}
