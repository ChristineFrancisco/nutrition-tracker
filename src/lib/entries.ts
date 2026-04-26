import { createClient } from "@/lib/supabase/server";
import type { Nutrients } from "@/lib/targets/types";

export type EntryStatus = "pending" | "analyzed" | "failed" | "rejected";

export type EntryType = "photo" | "text";

/**
 * Per-item breakdown the AI returned on analysis. Surfaced in the
 * expanded card so the user can see what the model thought the meal
 * contained — critical for the Refine flow, where the user corrects
 * misidentifications ("the lemons in the background aren't part of
 * this meal") before re-running.
 */
export type EntryItem = {
  id: string;
  name: string;
  estimated_serving: string | null;
  confidence: "low" | "medium" | "high" | null;
  reasoning: string | null;
  /**
   * Per-item nutrient breakdown the AI returned. Stored as JSONB so the
   * shape is whatever the model wrote — typed as a Partial<Nutrients>
   * so missing keys are tolerated (the UI just doesn't render that row).
   * Numeric-only: non-numbers in the JSONB get filtered out by
   * `parseNutrients` to keep the consumer code simple.
   */
  nutrients: Partial<Nutrients>;
};

export type EntryRow = {
  id: string;
  eaten_at: string;
  /** Photo entries are analyzed from an image; text entries are analyzed
   *  from the user_note description. Drives UI (no image tile for text
   *  entries) and the analyze pipeline (different system prompt). */
  entry_type: EntryType;
  photo_path: string | null;
  photo_expires_at: string | null;
  user_note: string | null;
  status: EntryStatus;
  /** Populated by the AI estimator when status='rejected' (e.g. not food). */
  rejection_reason: string | null;
  /** Short free-text notes from the estimator. For `failed` entries this
   *  is the error reason (rate limit, API key missing, JSON parse fail,
   *  etc.) — we surface it on the card so the user isn't staring at a
   *  silent red badge. For `analyzed` entries it's the model's summary. */
  model_notes: string | null;
  /** Short-lived signed URL for the photo. Null if photo was deleted / expired. */
  photo_url: string | null;
  /** Sum of `entry_items.nutrients.calories_kcal` for this entry. Null
   *  unless analyzed — pending/failed/rejected rows have no items and
   *  therefore no per-entry calorie figure. Surfaced here so the feed
   *  row can render "~420 kcal" without a second query. */
  calories_kcal: number | null;
  /** Items the AI identified. Empty for pending/failed/rejected entries
   *  (nothing to render) and populated for analyzed ones. */
  items: EntryItem[];
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — plenty for a page render.

/**
 * Return the [start, end) timestamps that bound a single local-calendar
 * day, where `day` is the date of interest. `end` is the next day's 00:00,
 * so Postgres range filters should use `>= start AND < end`.
 *
 * Computed in the Node process's local timezone. On your laptop that's
 * your wall-clock tz; on Vercel it defaults to UTC, which would drift
 * from the user's actual day — fix that later with a `profiles.timezone`
 * column (populated from `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * at sign-up) and doing the boundary math from that.
 */
export function dayBoundaries(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Return the [start, end) timestamps that bound the local calendar
 * month containing `day`. `start` is the 1st at 00:00 local time; `end`
 * is the 1st of the next month at 00:00. Same caveat about tz as
 * dayBoundaries applies.
 */
export function monthBoundaries(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

/** YYYY-MM-DD in the Node process's local timezone. */
export function formatLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Load entries for a specific local calendar day for the signed-in user
 * and attach freshly-signed Storage URLs for any photos that haven't
 * expired yet.
 *
 * Uses PostgREST's nested-select syntax to pull each entry's
 * `entry_items` in the same roundtrip. The items are small (usually
 * 1-5 per entry) and only two short text fields each, so pulling them
 * always is cheaper than a per-entry fetch on expand.
 */
export async function getEntriesForDate(day: Date): Promise<EntryRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { start, end } = dayBoundaries(day);

  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, eaten_at, entry_type, photo_path, photo_expires_at, user_note, status, rejection_reason, model_notes, entry_items(id, name, estimated_serving, confidence, reasoning, created_at, nutrients)"
    )
    .eq("user_id", user.id)
    .gte("eaten_at", start.toISOString())
    .lt("eaten_at", end.toISOString())
    .order("eaten_at", { ascending: false });

  if (error) throw new Error(`Load entries failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Sign only the paths that still exist. Batch into one call per entry;
  // Supabase doesn't have a bulk sign-paths endpoint but these are
  // lightweight HMAC operations.
  const withUrls = await Promise.all(
    data.map(async (row) => {
      // Sort items by created_at so the render order matches the order
      // the model returned them in (the insert preserves model order via
      // the array).
      const rawItems = (row as { entry_items?: unknown[] }).entry_items ?? [];
      const sortedRaw = (rawItems as Array<Record<string, unknown>>)
        .slice()
        .sort((a, b) => {
          const at = String(a.created_at ?? "");
          const bt = String(b.created_at ?? "");
          return at.localeCompare(bt);
        });

      const items: EntryItem[] = sortedRaw.map((it) => ({
        id: String(it.id),
        name: String(it.name ?? ""),
        estimated_serving:
          it.estimated_serving == null ? null : String(it.estimated_serving),
        confidence:
          it.confidence === "low" ||
          it.confidence === "medium" ||
          it.confidence === "high"
            ? it.confidence
            : null,
        reasoning: it.reasoning == null ? null : String(it.reasoning),
        nutrients: parseNutrients(it.nutrients),
      }));

      // Per-entry calorie sum. Only meaningful for analyzed rows; we
      // explicitly null it everywhere else so the UI doesn't have to
      // distinguish "0 because not analyzed" from "0 because the meal
      // was actually 0 kcal" (rare but real — a glass of water).
      let caloriesKcal: number | null = null;
      if (row.status === "analyzed") {
        let sum = 0;
        for (const it of sortedRaw) {
          const n = (it.nutrients as Record<string, unknown> | null) ?? {};
          const cal = n.calories_kcal;
          if (typeof cal === "number" && Number.isFinite(cal)) {
            sum += cal;
          }
        }
        caloriesKcal = sum;
      }

      if (!row.photo_path) {
        return { ...row, photo_url: null, calories_kcal: caloriesKcal, items };
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("food-photos")
        .createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
      if (signErr) {
        // Most common cause: the object has been cleaned up but the row
        // hasn't been updated yet. Treat as "photo gone", don't blow up.
        return { ...row, photo_url: null, calories_kcal: caloriesKcal, items };
      }
      return {
        ...row,
        photo_url: signed.signedUrl,
        calories_kcal: caloriesKcal,
        items,
      };
    })
  );

  return withUrls as EntryRow[];
}

/**
 * Thin wrapper: today's entries. Kept separate so call sites that mean
 * "today" read as such, and so we don't have to pass `new Date()` at
 * every call.
 */
export async function getTodayEntries(): Promise<EntryRow[]> {
  return getEntriesForDate(new Date());
}

/**
 * Coerce the JSONB `nutrients` blob into a Partial<Nutrients>. Anything
 * non-numeric or non-finite is dropped, so consumers can rely on every
 * present key being a real number. Unknown keys (i.e. nutrients we don't
 * model) pass through too — they just won't render because the UI iterates
 * over `NUTRIENT_LABELS`, not the raw blob.
 */
function parseNutrients(raw: unknown): Partial<Nutrients> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out as Partial<Nutrients>;
}
