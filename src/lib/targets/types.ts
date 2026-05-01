/**
 * Shared types for nutrition targets and profile data.
 * Used by both the computeGoals library and the UI.
 */

export type TargetMode = "generic" | "personalized" | "custom";

export type Sex = "male" | "female" | "other";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

/**
 * Direction of the user's body-weight goal. Drives the sign of the
 * calorie delta applied against TDEE in computeGoals.
 */
export type GoalKind = "lose" | "maintain" | "gain";

/**
 * What the user is doing alongside the calorie target. Doesn't change
 * TDEE (activity_level handles that), but does change the protein
 * scalar — preserving muscle while cutting needs more protein than
 * default DRI; recomp / building need even more.
 *
 *   preserve — default cutting plan: 1.6 g/kg, fat 27%, carbs fill
 *   recomp   — body-recomposition: 2.0 g/kg, fat 25%, carbs fill
 *   build    — bulking + lifting: 2.0 g/kg, fat 25%, carbs fill
 */
export type CompositionFocus = "preserve" | "recomp" | "build";

/**
 * One Nutrients value represents a target (for "good" nutrients we want to
 * hit at least this much) or a ceiling (for "bad" nutrients we want to stay
 * under). The `NUTRIENT_SEMANTICS` map below says which is which.
 */
export type Nutrients = {
  // Energy
  calories_kcal: number;
  // Macros
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturated_fat_g: number;   // ceiling
  trans_fat_g: number;       // ceiling (always 0)
  fiber_g: number;
  sugar_g: number;           // total sugars (no target, tracked only)
  added_sugar_g: number;     // ceiling
  cholesterol_mg: number;    // ceiling (FDA DV 300 mg)
  // Minerals
  sodium_mg: number;         // ceiling
  potassium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  magnesium_mg: number;
  zinc_mg: number;
  phosphorus_mg: number;
  copper_mg: number;
  selenium_mcg: number;
  manganese_mg: number;      // AI, not RDA
  // Vitamins
  vitamin_a_mcg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
  vitamin_e_mg: number;
  vitamin_k_mcg: number;
  b12_mcg: number;
  folate_mcg: number;
  thiamin_mg: number;        // B1
  riboflavin_mg: number;     // B2
  niacin_mg: number;         // B3
  b6_mg: number;
  choline_mg: number;        // AI, not RDA
};

export type NutrientKey = keyof Nutrients;

export type NutrientSemantic = "target" | "ceiling";

/**
 * For each nutrient: is the value we store a "hit this much" target, or a
 * "stay under this much" ceiling? This drives the goal-hit logic in
 * reports and the progress-bar color in the UI.
 */
export const NUTRIENT_SEMANTICS: Record<NutrientKey, NutrientSemantic> = {
  calories_kcal: "target",
  protein_g: "target",
  carbs_g: "target",
  fat_g: "target",
  saturated_fat_g: "ceiling",
  trans_fat_g: "ceiling",
  fiber_g: "target",
  sugar_g: "target",       // placeholder — no FDA/DRI target; not rendered
  added_sugar_g: "ceiling",
  cholesterol_mg: "ceiling",
  sodium_mg: "ceiling",
  potassium_mg: "target",
  calcium_mg: "target",
  iron_mg: "target",
  magnesium_mg: "target",
  zinc_mg: "target",
  phosphorus_mg: "target",
  copper_mg: "target",
  selenium_mcg: "target",
  manganese_mg: "target",
  vitamin_a_mcg: "target",
  vitamin_c_mg: "target",
  vitamin_d_mcg: "target",
  vitamin_e_mg: "target",
  vitamin_k_mcg: "target",
  b12_mcg: "target",
  folate_mcg: "target",
  thiamin_mg: "target",
  riboflavin_mg: "target",
  niacin_mg: "target",
  b6_mg: "target",
  choline_mg: "target",
};

/**
 * Human-readable labels + units for UI rendering. Keep in sync with
 * Nutrients keys.
 */
export const NUTRIENT_LABELS: Record<
  NutrientKey,
  { label: string; unit: string; group: "energy" | "macro" | "mineral" | "vitamin" }
> = {
  calories_kcal: { label: "Calories", unit: "kcal", group: "energy" },
  protein_g: { label: "Protein", unit: "g", group: "macro" },
  carbs_g: { label: "Carbohydrates", unit: "g", group: "macro" },
  fat_g: { label: "Total fat", unit: "g", group: "macro" },
  saturated_fat_g: { label: "Saturated fat", unit: "g", group: "macro" },
  trans_fat_g: { label: "Trans fat", unit: "g", group: "macro" },
  fiber_g: { label: "Fiber", unit: "g", group: "macro" },
  sugar_g: { label: "Total sugar", unit: "g", group: "macro" },
  added_sugar_g: { label: "Added sugar", unit: "g", group: "macro" },
  cholesterol_mg: { label: "Cholesterol", unit: "mg", group: "macro" },
  sodium_mg: { label: "Sodium", unit: "mg", group: "mineral" },
  potassium_mg: { label: "Potassium", unit: "mg", group: "mineral" },
  calcium_mg: { label: "Calcium", unit: "mg", group: "mineral" },
  iron_mg: { label: "Iron", unit: "mg", group: "mineral" },
  magnesium_mg: { label: "Magnesium", unit: "mg", group: "mineral" },
  zinc_mg: { label: "Zinc", unit: "mg", group: "mineral" },
  phosphorus_mg: { label: "Phosphorus", unit: "mg", group: "mineral" },
  copper_mg: { label: "Copper", unit: "mg", group: "mineral" },
  selenium_mcg: { label: "Selenium", unit: "mcg", group: "mineral" },
  manganese_mg: { label: "Manganese", unit: "mg", group: "mineral" },
  vitamin_a_mcg: { label: "Vitamin A", unit: "mcg", group: "vitamin" },
  vitamin_c_mg: { label: "Vitamin C", unit: "mg", group: "vitamin" },
  vitamin_d_mcg: { label: "Vitamin D", unit: "mcg", group: "vitamin" },
  vitamin_e_mg: { label: "Vitamin E", unit: "mg", group: "vitamin" },
  vitamin_k_mcg: { label: "Vitamin K", unit: "mcg", group: "vitamin" },
  b12_mcg: { label: "Vitamin B12", unit: "mcg", group: "vitamin" },
  folate_mcg: { label: "Folate", unit: "mcg", group: "vitamin" },
  thiamin_mg: { label: "Thiamin (B1)", unit: "mg", group: "vitamin" },
  riboflavin_mg: { label: "Riboflavin (B2)", unit: "mg", group: "vitamin" },
  niacin_mg: { label: "Niacin (B3)", unit: "mg", group: "vitamin" },
  b6_mg: { label: "Vitamin B6", unit: "mg", group: "vitamin" },
  choline_mg: { label: "Choline", unit: "mg", group: "vitamin" },
};

/**
 * The subset of the profiles row that drives goal computation.
 *
 * Goal-coach fields (goal_kind / weekly_change_kg / composition_focus)
 * are optional so onboarding-time and pre-coach call sites can build
 * a ProfileForGoals literal without specifying them. computeGoals
 * supplies safe defaults (maintenance, no delta, preserve) when they
 * aren't set.
 */
export type ProfileForGoals = {
  target_mode: TargetMode;
  sex: Sex | null;
  birth_date: string | null; // ISO date
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal_kind?: GoalKind;
  weekly_change_kg?: number;
  composition_focus?: CompositionFocus;
};
