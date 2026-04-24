/**
 * Google Gemini vision adapter for NutritionEstimator.
 *
 * Flow:
 *   1. Fetch the signed photo URL → bytes → base64.
 *   2. Call Gemini's generateContent with the image (inline base64) +
 *      system instruction.
 *   3. Ask Gemini for `responseMimeType: "application/json"` so the model
 *      returns raw JSON with no prose or markdown fences — Gemini's
 *      equivalent of the Claude assistant-prefill trick.
 *   4. JSON.parse the response text, validate with Zod. Errors bubble up
 *      as regular exceptions — the server action catches them and marks
 *      the entry `status='failed'`.
 *
 * Model: Gemini 2.5 Flash by default (plan.md §12 — Google offers a free
 * tier with generous RPM/RPD limits that's plenty for personal use).
 * Switch by passing a different `model` to the constructor or by editing
 * getEstimator().
 */

import { GoogleGenAI } from "@google/genai";
import { AnalyzeResultSchema } from "./schema";
import {
  PHOTO_ESTIMATOR_SYSTEM_PROMPT,
  TEXT_ESTIMATOR_SYSTEM_PROMPT,
} from "./prompt";
import type { AnalyzeResult, NutritionEstimator } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
// 2048 gives comfortable headroom over the ~500–800 tokens a typical
// multi-item JSON needs. Paired with thinkingBudget=0 below, all of this
// budget is available for the JSON itself.
const MAX_OUTPUT_TOKENS = 2048;

// Retry schedule for transient Gemini errors (503 UNAVAILABLE, 429
// RESOURCE_EXHAUSTED, 500 INTERNAL, or outright network failures). Most
// free-tier overload spikes clear within a second or two; three attempts
// on a 0.5s/1s/2s backoff absorbs that cleanly without ballooning the
// user-visible request time. The client card stays on "Analyzing…" the
// whole time so there's no visible difference.
const RETRY_BACKOFF_MS = [500, 1000, 2000];

/**
 * Supported image MIME types for Gemini's inline data. We only send
 * JPEGs from the client today (CaptureForm compresses to JPEG 0.85), but
 * accept the others defensively in case that changes.
 */
type GeminiImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif";

export class GeminiEstimator implements NutritionEstimator {
  private client: GoogleGenAI;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to .env.local."
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = opts?.model ?? DEFAULT_MODEL;
  }

  async analyze(input: {
    imageUrl: string;
    userNote?: string;
  }): Promise<AnalyzeResult> {
    const { base64, mediaType } = await fetchImageAsBase64(input.imageUrl);

    const userText = input.userNote
      ? `User note: ${input.userNote}\n\nAnalyze this meal.`
      : "Analyze this meal.";

    // Retry loop for transient Gemini errors (see RETRY_BACKOFF_MS). We
    // retry the generateContent call itself — fetchImageAsBase64 runs
    // once upstream since the image bytes don't change between attempts.
    const response = await this.callWithRetry(async () =>
      this.client.models.generateContent({
        model: this.model,
        // Gemini takes the system prompt on `config.systemInstruction`
        // and supports strict JSON output via responseMimeType. That
        // replaces the assistant-prefill `{` trick we used for Claude.
        //
        // thinkingBudget: 0 disables Gemini 2.5 Flash's default
        // "thinking" phase. Thinking tokens count against
        // maxOutputTokens, so with it enabled the model can burn most of
        // the budget on internal reasoning and truncate the visible JSON
        // mid-object. Our system prompt is deterministic and the schema
        // is strict — we don't need reflection, just structured output.
        config: {
          systemInstruction: PHOTO_ESTIMATOR_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: 0 },
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mediaType,
                  data: base64,
                },
              },
              { text: userText },
            ],
          },
        ],
      })
    );

    const rawJson = (response.text ?? "").trim();
    if (!rawJson) {
      throw new Error("Model returned no text content.");
    }

    // If Gemini hit the token cap the response is likely truncated
    // mid-JSON. Call that out explicitly instead of surfacing a generic
    // "invalid JSON" parse error — lets us (or a future reader) spot the
    // real cause at a glance.
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Model response truncated at maxOutputTokens (${MAX_OUTPUT_TOKENS}). ` +
          `Raise MAX_OUTPUT_TOKENS in gemini.ts or check thinkingBudget.`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      throw new Error(
        `Model returned invalid JSON: ${(err as Error).message}. ` +
          `Raw response (first 200 chars): ${rawJson.slice(0, 200)}`
      );
    }

    const result = AnalyzeResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Model JSON did not match schema: ${result.error.message}`
      );
    }
    return result.data;
  }

  /**
   * Text-only analysis path. Same output shape as `analyze`, same retry
   * and truncation handling — only the system prompt and the absence of
   * an image part differ. We skip image fetch/base64 entirely, and the
   * text prompt caps per-item confidence at "medium" since there's no
   * visual to verify against.
   */
  async analyzeText(input: { description: string }): Promise<AnalyzeResult> {
    const description = input.description.trim();
    if (!description) {
      // Defensive: the server action validates this too, but double-check
      // so we don't waste a Gemini call on an empty string.
      throw new Error("Description is empty.");
    }

    const response = await this.callWithRetry(async () =>
      this.client.models.generateContent({
        model: this.model,
        config: {
          systemInstruction: TEXT_ESTIMATOR_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: 0 },
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `User description of the meal:\n${description}\n\nAnalyze this meal.`,
              },
            ],
          },
        ],
      })
    );

    const rawJson = (response.text ?? "").trim();
    if (!rawJson) {
      throw new Error("Model returned no text content.");
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Model response truncated at maxOutputTokens (${MAX_OUTPUT_TOKENS}). ` +
          `Raise MAX_OUTPUT_TOKENS in gemini.ts or check thinkingBudget.`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      throw new Error(
        `Model returned invalid JSON: ${(err as Error).message}. ` +
          `Raw response (first 200 chars): ${rawJson.slice(0, 200)}`
      );
    }

    const result = AnalyzeResultSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Model JSON did not match schema: ${result.error.message}`
      );
    }
    return result.data;
  }

  /**
   * Call the Gemini API with retry-on-transient-error. Retries only for
   * errors that plausibly clear on their own — overload (503), quota
   * bursts (429), upstream hiccups (500), and raw network failures.
   * Everything else (400 invalid request, 401/403 auth) throws on the
   * first attempt because retrying won't help.
   */
  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retryable = isRetryableGeminiError(err);
        const hasMoreAttempts = attempt < RETRY_BACKOFF_MS.length;
        if (!retryable || !hasMoreAttempts) throw err;
        await sleep(RETRY_BACKOFF_MS[attempt]!);
      }
    }
    // Unreachable — the loop either returns or throws — but satisfies
    // TypeScript's control-flow analysis.
    throw lastErr;
  }
}

/**
 * Detect Gemini errors we should retry. The SDK surfaces HTTP errors by
 * including the status body in the message (e.g. `{"error":{"code":503,
 * "status":"UNAVAILABLE", ...}}`), so string-matching on the message is
 * the simplest approach that works across SDK versions. Network errors
 * (fetch failures, DNS) usually carry no status code — retry those too.
 */
function isRetryableGeminiError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return true; // unknown shape → assume transient
  return (
    /\b(503|429|500)\b/.test(msg) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|DEADLINE_EXCEEDED/i.test(msg) ||
    /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(msg)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download an image over HTTP and return it base64-encoded with its
 * detected media type. Falls back to `image/jpeg` if the server doesn't
 * send a content-type (Supabase signed URLs always do, but defensive).
 */
async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: GeminiImageMediaType }> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch image (${res.status} ${res.statusText})`
    );
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const mediaType = normalizeMediaType(contentType);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString("base64"), mediaType };
}

function normalizeMediaType(raw: string): GeminiImageMediaType {
  const t = raw.split(";")[0]!.trim().toLowerCase();
  if (
    t === "image/jpeg" ||
    t === "image/png" ||
    t === "image/webp" ||
    t === "image/heic" ||
    t === "image/heif"
  ) {
    return t;
  }
  // Gemini supports jpeg/png/webp/heic/heif. Anything else (e.g. gif) —
  // label it jpeg. The client should have transcoded to jpeg via canvas
  // compression before we got here.
  return "image/jpeg";
}
