/**
 * The NutritionEstimator abstraction from plan.md §4.
 *
 * An estimator takes a photo (and optional user note) and returns either:
 *   - `{status:"ok", items, totals, modelNotes, ...}`  — real food detected
 *   - `{status:"rejected", reason}`                    — not food
 *
 * This file is provider-agnostic. The Gemini adapter lives in ./gemini.ts
 * and satisfies this interface; other adapters (Claude, OpenAI, test
 * fakes) would sit alongside it.
 */

import type { Nutrients } from "@/lib/targets/types";

export type Confidence = "low" | "medium" | "high";

export type EstimatedItem = {
  /** Short human-facing name, e.g. "grilled chicken breast". */
  name: string;
  /** Model's portion guess as free text, e.g. "1 cup", "~150 g". */
  estimated_serving: string;
  /** Model's per-item confidence — drives the UI warning chips. */
  confidence: Confidence;
  /** Optional explanation of why confidence is what it is. */
  reasoning?: string;
  /** Full Nutrients breakdown for this single item. */
  nutrients: Nutrients;
};

export type AnalyzeOk = {
  status: "ok";
  items: EstimatedItem[];
  /** Sum of item nutrients. The server recomputes this from items to be
   *  safe, but we let the model emit it for observability. */
  totals: Nutrients;
  /** One-liner from the model — e.g. "Portions assumed standard US
   *  restaurant sizes." Surfaces on the entry detail view. */
  modelNotes: string;
  /**
   * Short positive callouts the model flags based on what's on the plate,
   * e.g. ["high fiber", "omega-3 source"]. Not required.
   */
  good_highlights?: string[];
  /**
   * Short negative callouts, e.g. ["high sodium", "added sugar"].
   */
  bad_highlights?: string[];
};

export type AnalyzeRejected = {
  status: "rejected";
  /** Short, user-facing. e.g. "This looks like a receipt, not food." */
  reason: string;
};

export type AnalyzeResult = AnalyzeOk | AnalyzeRejected;

export interface NutritionEstimator {
  analyze(input: {
    /** Publicly-fetchable URL (signed, short TTL). The adapter is
     *  responsible for downloading + base64-encoding if the underlying
     *  API needs that. */
    imageUrl: string;
    /** Optional free-text hint from the user, e.g. "this is a half
     *  portion" or "the sauce is soy ginger". */
    userNote?: string;
  }): Promise<AnalyzeResult>;
}
