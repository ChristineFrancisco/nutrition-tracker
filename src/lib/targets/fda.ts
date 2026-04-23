import type { Nutrients } from "./types";

/**
 * FDA Daily Values (DV) as published on the Nutrition Facts label.
 * These are the generic, one-size-fits-all reference values the FDA uses
 * on food packaging — based on a 2,000 kcal reference diet.
 *
 * Source: 21 CFR 101.9 (FDA nutrition labeling regulations, 2020 update).
 * For ceilings (sodium, saturated fat, added sugar, trans fat) the value
 * is the intake to stay UNDER; for all others it's the intake to hit.
 *
 * Trans fat has no FDA DV; WHO recommends as close to 0 as possible, so
 * we store 0 and flag any intake as over-ceiling.
 */
export const FDA_DAILY_VALUES: Nutrients = {
  // Energy
  calories_kcal: 2000,

  // Macros
  protein_g: 50,
  carbs_g: 275,
  fat_g: 78,
  saturated_fat_g: 20,
  trans_fat_g: 0,
  fiber_g: 28,
  sugar_g: 0,          // FDA doesn't set a DV for total sugar; stored only
  added_sugar_g: 50,
  cholesterol_mg: 300, // ceiling

  // Minerals
  sodium_mg: 2300,
  potassium_mg: 4700,
  calcium_mg: 1300,
  iron_mg: 18,
  magnesium_mg: 420,
  zinc_mg: 11,
  phosphorus_mg: 1250,
  copper_mg: 0.9,
  selenium_mcg: 55,
  manganese_mg: 2.3,

  // Vitamins
  vitamin_a_mcg: 900,
  vitamin_c_mg: 90,
  vitamin_d_mcg: 20,
  vitamin_e_mg: 15,
  vitamin_k_mcg: 120,
  b12_mcg: 2.4,
  folate_mcg: 400,
  thiamin_mg: 1.2,
  riboflavin_mg: 1.3,
  niacin_mg: 16,
  b6_mg: 1.7,
  choline_mg: 550,
};
