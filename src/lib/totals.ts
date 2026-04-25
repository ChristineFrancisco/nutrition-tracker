import { createClient } from "@/lib/supabase/server";
import {
  dayBoundaries,
  formatLocalDateString,
  monthBoundaries,
} from "@/lib/entries";
import {
  NUTRIENT_LABELS,
  NUTRIENT_SEMANTICS,
  type NutrientKey,
  type Nutrients,
} from "@/lib/targets/types";

/**
 * Per-day rollup of a user's nutrition against their targets.
 *
 * `totals` is the sum of every `entry_items.nutrients` row that belongs
 * to a today's-analyzed entry of the current user. Pending, failed,
 * and rejected entries are ignored — they contribute no nutrients.
 *
 * `entryCount` counts only the analyzed entries so the UI can say
 * "0 meals logged" vs "3 meals logged" cleanly. Pending entries show
 * up in the feed as "Analyzing…" cards on their own; they shouldn't
 * also inflate the totals summary.
 */
export type TodayTotals = {
  totals: Nutrients;
  entryCount: number;
};

/** Shape we need for computeHighlights — the goals row is a superset. */
type GoalsShape = Nutrients;

/**
 * Zero-filled Nutrients. Used as the starting accumulator for sums and
 * as a safe default when there's nothing logged yet.
 */
export function zeroNutrients(): Nutrients {
  return {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    saturated_fat_g: 0,
    trans_fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    added_sugar_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    iron_mg: 0,
    magnesium_mg: 0,
    zinc_mg: 0,
    phosphorus_mg: 0,
    copper_mg: 0,
    selenium_mcg: 0,
    manganese_mg: 0,
    vitamin_a_mcg: 0,
    vitamin_c_mg: 0,
    vitamin_d_mcg: 0,
    vitamin_e_mg: 0,
    vitamin_k_mcg: 0,
    b12_mcg: 0,
    folate_mcg: 0,
    thiamin_mg: 0,
    riboflavin_mg: 0,
    niacin_mg: 0,
    b6_mg: 0,
    choline_mg: 0,
  };
}

/**
 * Load analyzed entries for a specific local-calendar day, pull their
 * items' nutrients JSONB blobs, and sum them up. Shares the same
 * dayBoundaries math as getEntriesForDate so both views agree on what
 * that date means.
 */
export async function getTotalsForDate(day: Date): Promise<TodayTotals> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { totals: zeroNutrients(), entryCount: 0 };

  const { start, end } = dayBoundaries(day);

  // One query: that day's analyzed entries with their items' nutrients.
  // PostgREST nested select lets us avoid a round-trip for items.
  const { data, error } = await supabase
    .from("entries")
    .select("id, entry_items(nutrients)")
    .eq("user_id", user.id)
    .eq("status", "analyzed")
    .gte("eaten_at", start.toISOString())
    .lt("eaten_at", end.toISOString());

  if (error) throw new Error(`Load totals failed: ${error.message}`);
  if (!data || data.length === 0) {
    return { totals: zeroNutrients(), entryCount: 0 };
  }

  const totals = zeroNutrients();
  const keys = Object.keys(totals) as NutrientKey[];

  for (const entry of data as Array<{
    id: string;
    entry_items: Array<{ nutrients: Record<string, unknown> }> | null;
  }>) {
    const items = entry.entry_items ?? [];
    for (const item of items) {
      const n = item.nutrients ?? {};
      for (const k of keys) {
        const v = n[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          totals[k] += v;
        }
      }
    }
  }

  return { totals, entryCount: data.length };
}

/**
 * Thin wrapper: today's totals. Matches the getTodayEntries shape so
 * /today's imports don't change.
 */
export async function getTodayTotals(): Promise<TodayTotals> {
  return getTotalsForDate(new Date());
}

/**
 * Return value × 100 / target, clamped to the [0, cap] range. We clamp
 * so a user who's gone 3x over their sodium doesn't explode a progress
 * bar off the page — the bar fills, a "Watch" chip fires, and we stop
 * caring about the actual multiplier.
 */
export function pctOf(value: number, target: number, cap = 150): number {
  if (!target || target <= 0) return 0;
  const pct = (value / target) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(cap, pct));
}

/**
 * Compute good/watch highlight chips from totals vs targets. We do
 * this deterministically from the numbers rather than trusting the
 * model's per-entry opinions so the chips are consistent across the
 * day (a low-sodium breakfast plus a very-high-sodium dinner still
 * correctly fires a sodium watch).
 *
 * Rules:
 *  - For `target` nutrients: "good" if totals ≥ 80% of target. We
 *    prioritize nutrients that are frequently under-hit (protein,
 *    fiber, vit D, iron, calcium, vit C, B12) so the chips feel
 *    useful rather than trivial ("you got your niacin again").
 *  - For `ceiling` nutrients: "watch" if totals > 100% of ceiling.
 *    Every ceiling that fires gets called out — overshooting sodium
 *    or saturated fat is the most common actionable feedback we can
 *    give.
 *
 * Returns labels in a stable order (by importance, not alphabetical)
 * so the chips don't re-shuffle on every render.
 */
const GOOD_PRIORITY: NutrientKey[] = [
  "protein_g",
  "fiber_g",
  "vitamin_d_mcg",
  "iron_mg",
  "calcium_mg",
  "vitamin_c_mg",
  "b12_mcg",
  "potassium_mg",
  "magnesium_mg",
  "folate_mcg",
  "zinc_mg",
];

const WATCH_PRIORITY: NutrientKey[] = [
  "sodium_mg",
  "saturated_fat_g",
  "added_sugar_g",
  "cholesterol_mg",
  "trans_fat_g",
];

export type Highlight = {
  key: NutrientKey;
  label: string;
  /** 0-150, same scale as pctOf. */
  pct: number;
};

export function computeHighlights(
  totals: Nutrients,
  goals: GoalsShape
): { good: Highlight[]; watch: Highlight[] } {
  const good: Highlight[] = [];
  for (const k of GOOD_PRIORITY) {
    if (NUTRIENT_SEMANTICS[k] !== "target") continue;
    const target = goals[k];
    const pct = pctOf(totals[k], target);
    if (pct >= 80) {
      good.push({ key: k, label: NUTRIENT_LABELS[k].label, pct });
    }
  }

  const watch: Highlight[] = [];
  for (const k of WATCH_PRIORITY) {
    if (NUTRIENT_SEMANTICS[k] !== "ceiling") continue;
    const ceiling = goals[k];
    // trans_fat ceiling is effectively 0, so any amount trips it. Guard
    // against divide-by-zero by treating ceiling 0 as "any is over".
    const over =
      ceiling > 0 ? totals[k] > ceiling : totals[k] > 0;
    if (over) {
      const pct = ceiling > 0 ? pctOf(totals[k], ceiling) : 150;
      watch.push({ key: k, label: NUTRIENT_LABELS[k].label, pct });
    }
  }

  return { good, watch };
}

// ----- Month heatmap aggregation -------------------------------------------

/**
 * One calendar cell's worth of data for the month heatmap.
 *
 * `calories` is the sum of analyzed entry_items.nutrients.calories_kcal
 * for that day. We only carry calories here because the heatmap colors
 * by percentage of calorie target — surfacing the full Nutrients shape
 * for every day would be wasted bandwidth. If a future view wants
 * per-day macros or micros, split into a fuller helper rather than
 * growing this one.
 *
 * `hasLowConfidence` satisfies plan §11.4: flag any day whose entries
 * include at least one `low` item, so the calendar can render a ⚠
 * marker and the user knows to re-check.
 */
export type DayCaloriesCell = {
  date: string; // YYYY-MM-DD (local tz)
  calories: number;
  entryCount: number;
  hasLowConfidence: boolean;
};

/**
 * Load per-day calorie totals for the local calendar month that contains
 * `day`. Returns a Map keyed by YYYY-MM-DD so the caller can look up
 * cells by grid position without having to iterate.
 *
 * Pulls all analyzed entries in the month with each item's calories and
 * confidence in one round-trip, then buckets by day in TS. Upper bound
 * at the 20/day cap × 31 days = 620 entries/month — trivially small.
 *
 * If we ever hit scale where this stings, swap in a Postgres RPC that
 * does `date_trunc('day', eaten_at)` + `sum((item->>'calories_kcal')::numeric)`
 * in SQL. Same shape out, just more efficient.
 */
export async function getMonthCaloriesByDay(
  day: Date
): Promise<Map<string, DayCaloriesCell>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { start, end } = monthBoundaries(day);

  const { data, error } = await supabase
    .from("entries")
    .select("id, eaten_at, entry_items(confidence, nutrients)")
    .eq("user_id", user.id)
    .eq("status", "analyzed")
    .gte("eaten_at", start.toISOString())
    .lt("eaten_at", end.toISOString());

  if (error) throw new Error(`Load month totals failed: ${error.message}`);

  const out = new Map<string, DayCaloriesCell>();
  for (const entry of (data ?? []) as Array<{
    id: string;
    eaten_at: string;
    entry_items:
      | Array<{
          confidence: string | null;
          nutrients: Record<string, unknown>;
        }>
      | null;
  }>) {
    // Bucket by the local-tz date of eaten_at. new Date() parses ISO
    // timestamps into the process's local tz, so formatLocalDateString
    // gives us the right calendar day.
    const key = formatLocalDateString(new Date(entry.eaten_at));
    const cell = out.get(key) ?? {
      date: key,
      calories: 0,
      entryCount: 0,
      hasLowConfidence: false,
    };
    cell.entryCount += 1;
    for (const item of entry.entry_items ?? []) {
      const cal = item.nutrients?.calories_kcal;
      if (typeof cal === "number" && Number.isFinite(cal)) {
        cell.calories += cal;
      }
      if (item.confidence === "low") cell.hasLowConfidence = true;
    }
    out.set(key, cell);
  }
  return out;
}
