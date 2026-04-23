/**
 * Zod mirrors of the AnalyzeResult types. Used to validate the JSON that
 * the estimator returns before we trust it enough to persist. If the
 * model deviates from the schema (missing field, wrong type, extra
 * garbage), Zod rejects it and we record the entry as `status='failed'`.
 *
 * The nutrient keys are enumerated explicitly rather than generated from
 * the Nutrients type so the Zod check is real at runtime; TypeScript
 * types erase.
 */

import { z } from "zod";

const NutrientsSchema = z.object({
  calories_kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  saturated_fat_g: z.number().nonnegative(),
  trans_fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative(),
  sugar_g: z.number().nonnegative(),
  added_sugar_g: z.number().nonnegative(),
  sodium_mg: z.number().nonnegative(),
  potassium_mg: z.number().nonnegative(),
  calcium_mg: z.number().nonnegative(),
  iron_mg: z.number().nonnegative(),
  magnesium_mg: z.number().nonnegative(),
  vitamin_a_mcg: z.number().nonnegative(),
  vitamin_c_mg: z.number().nonnegative(),
  vitamin_d_mcg: z.number().nonnegative(),
  vitamin_e_mg: z.number().nonnegative(),
  vitamin_k_mcg: z.number().nonnegative(),
  b12_mcg: z.number().nonnegative(),
  folate_mcg: z.number().nonnegative(),
});

const EstimatedItemSchema = z.object({
  name: z.string().min(1).max(120),
  estimated_serving: z.string().min(1).max(120),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().max(500).optional(),
  nutrients: NutrientsSchema,
});

const AnalyzeOkSchema = z.object({
  status: z.literal("ok"),
  items: z.array(EstimatedItemSchema).min(1).max(20),
  totals: NutrientsSchema,
  modelNotes: z.string().max(1000),
  good_highlights: z.array(z.string().max(80)).max(6).optional(),
  bad_highlights: z.array(z.string().max(80)).max(6).optional(),
});

const AnalyzeRejectedSchema = z.object({
  status: z.literal("rejected"),
  reason: z.string().min(1).max(280),
});

export const AnalyzeResultSchema = z.discriminatedUnion("status", [
  AnalyzeOkSchema,
  AnalyzeRejectedSchema,
]);

export type AnalyzeResultParsed = z.infer<typeof AnalyzeResultSchema>;
