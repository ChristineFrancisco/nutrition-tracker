/**
 * Factory for the app's active NutritionEstimator. Today this is always
 * Google Gemini 2.5 Flash; swap by editing this file (or gate on an env
 * var).
 *
 * Callers import from this barrel rather than from ./gemini directly, so
 * changing providers is a one-file edit.
 */

import { GeminiEstimator } from "./gemini";
import type { NutritionEstimator } from "./types";

export type { AnalyzeResult, EstimatedItem, NutritionEstimator } from "./types";

let cached: NutritionEstimator | null = null;

/**
 * Returns a process-singleton estimator. Constructing the SDK client on
 * every call is cheap but unnecessary.
 */
export function getEstimator(): NutritionEstimator {
  if (!cached) cached = new GeminiEstimator();
  return cached;
}
