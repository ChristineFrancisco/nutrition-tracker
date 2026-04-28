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
import type {
  UpperLimitKey,
  UpperLimitMeta,
} from "@/lib/targets/upper_limits";

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

// ----- Upper-limit excesses ------------------------------------------------

/**
 * One UL crossing surfaced by computeExcesses. Mirrors the Highlight
 * shape so call sites can render it the same way (just with red
 * styling instead of amber).
 */
export type Excess = {
  key: UpperLimitKey;
  label: string;
  total: number;
  limit: number;
  /** Percentage of UL — uncapped so the callout can read "248% of UL"
   *  for genuinely worrying days. */
  pct: number;
  unit: string;
  source: UpperLimitMeta["source"];
  risk: string;
};

/**
 * Compute Excess[] for a totals + upper-limit pair. Mirrors
 * computeHighlights / computeExcesses spec from plan.md §15.
 *
 * Rules:
 *   - For each UL key, compare totals[k] to upperLimits[k].value.
 *   - If totals[k] > limit, push an Excess.
 *   - Sort by descending pct so the most-egregious crossing comes first
 *     (the user's eye lands on the worst one).
 *
 * Source-restricted ULs (niacin, folic acid, magnesium) are checked
 * against the same total; the callout copy carries the "supplements
 * drive most of this" caveat so the user doesn't panic over fortified
 * cereal. See plan §15 for why this is correct for v1.
 */
export function computeExcesses(
  totals: Nutrients,
  upperLimits: Partial<Record<UpperLimitKey, UpperLimitMeta>>,
): Excess[] {
  const out: Excess[] = [];
  for (const [key, meta] of Object.entries(upperLimits) as Array<
    [UpperLimitKey, UpperLimitMeta]
  >) {
    const total = totals[key];
    if (typeof total !== "number" || total <= 0) continue;
    if (total <= meta.value) continue;
    const pct = Math.round((total / meta.value) * 100);
    out.push({
      key,
      label: NUTRIENT_LABELS[key].label,
      total,
      limit: meta.value,
      pct,
      unit: NUTRIENT_LABELS[key].unit,
      source: meta.source,
      risk: meta.risk,
    });
  }
  out.sort((a, b) => b.pct - a.pct);
  return out;
}

// ----- Range aggregation ---------------------------------------------------

/**
 * One day's worth of data inside a range view. Mirrors the shape we use
 * for per-day rendering elsewhere (totals + entryCount), plus the
 * historical-correct goals snapshot for that day so the UI can render
 * "% of target hit" against the goals that were actually in effect on
 * that date.
 *
 * `goals` is null only in the degenerate case where the user has zero
 * goals snapshots in the database (i.e. they signed up but never
 * completed onboarding) — the page can still render the totals
 * column-by-column, but the hit/streak math gracefully no-ops.
 */
export type RangeBucket = {
  date: string; // YYYY-MM-DD (local tz)
  totals: Nutrients;
  goals: Nutrients | null;
  entryCount: number;
  hasLowConfidence: boolean;
  /** True if any UL was crossed on this day. Same semantics as the
   *  flag on DayCaloriesCell — only populated when getRangeData is
   *  called with an `upperLimits` argument. Drives the per-day red
   *  dot in the range breakdown list and the daysOverUpperLimit
   *  count in RangeStats (M8 phase 3). */
  hasUpperLimitExcess: boolean;
};

export type RangeData = {
  /** Inclusive start, normalized to local 00:00. */
  from: Date;
  /** Inclusive end, normalized to local 00:00. */
  to: Date;
  /** One bucket per local calendar day in [from, to], chronological. */
  buckets: RangeBucket[];
};

/**
 * Aggregate analyzed entries + per-day goals snapshots over a date
 * range. One query per data source — entries by `eaten_at`, daily_goals
 * snapshots in chronological order — then bucketed by local-date in TS.
 *
 * The page is responsible for validating the range bounds (max 90 days,
 * from <= to, neither in the future). This helper trusts the inputs and
 * just does the work.
 *
 * Performance: at the 20-entries/day cap × 90 days × ~5 items each,
 * we're looking at ~9000 item rows max — a single Supabase query, no
 * problem. If we ever need to grow past that, swap to a Postgres RPC
 * that does the date-bucketing in SQL.
 */
export async function getRangeData(
  from: Date,
  to: Date,
  /** Optional UL meta map. When provided, each bucket's
   *  hasUpperLimitExcess flag is computed from per-day totals of the
   *  UL-relevant nutrients. Without it the flag stays false. */
  upperLimits?: Partial<Record<UpperLimitKey, UpperLimitMeta>>,
): Promise<RangeData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const start = startOfLocalDay(from);
  const endDay = startOfLocalDay(to);
  const exclusiveEnd = new Date(endDay);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);

  // Pre-build empty buckets so days with no entries still render. Walk
  // calendar days, not raw timestamps, so DST transitions don't cause
  // a 23h day to skip its bucket.
  const buckets: RangeBucket[] = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= endDay.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    buckets.push({
      date: formatLocalDateString(cursor),
      totals: zeroNutrients(),
      goals: null,
      entryCount: 0,
      hasLowConfidence: false,
      hasUpperLimitExcess: false,
    });
  }

  if (!user) return { from: start, to: endDay, buckets };

  // Entries in range.
  const { data: entryRows, error: entryErr } = await supabase
    .from("entries")
    .select("eaten_at, entry_items(confidence, nutrients)")
    .eq("user_id", user.id)
    .eq("status", "analyzed")
    .gte("eaten_at", start.toISOString())
    .lt("eaten_at", exclusiveEnd.toISOString());
  if (entryErr) throw new Error(`Load range failed: ${entryErr.message}`);

  // All snapshots for the user, ascending. We resolve "what goals were
  // in effect on day X" by walking ascending and remembering the
  // most-recent snapshot whose effective_from is <= end-of-day X. If
  // no snapshot is at-or-before the start of the range, fall back to
  // the earliest one (mirrors getGoalsEffectiveOn's fallback).
  const { data: goalsRows, error: goalsErr } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("effective_from", { ascending: true });
  if (goalsErr) throw new Error(`Load goals failed: ${goalsErr.message}`);

  const snapshots = (goalsRows ?? []).map((r) => ({
    effective_from: new Date(r.effective_from as string),
    goals: stripToNutrients(r as Record<string, unknown>),
  }));
  const earliestFallback = snapshots[0]?.goals ?? null;

  // Index buckets for O(1) lookup while accumulating entries.
  const byDate = new Map<string, RangeBucket>();
  for (const b of buckets) byDate.set(b.date, b);

  // Resolve goals per bucket. Single pass through `snapshots` rather
  // than O(N×M) per bucket.
  let snapIdx = 0;
  let activeGoals: Nutrients | null = earliestFallback;
  for (const b of buckets) {
    const eod = new Date(`${b.date}T23:59:59.999`);
    while (
      snapIdx < snapshots.length &&
      snapshots[snapIdx].effective_from.getTime() <= eod.getTime()
    ) {
      activeGoals = snapshots[snapIdx].goals;
      snapIdx += 1;
    }
    b.goals = activeGoals;
  }

  // Bucket entries by local-tz date.
  const keys = Object.keys(zeroNutrients()) as NutrientKey[];
  for (const entry of (entryRows ?? []) as Array<{
    eaten_at: string;
    entry_items: Array<{
      confidence: string | null;
      nutrients: Record<string, unknown> | null;
    }> | null;
  }>) {
    const dateStr = formatLocalDateString(new Date(entry.eaten_at));
    const b = byDate.get(dateStr);
    if (!b) continue;
    b.entryCount += 1;
    for (const item of entry.entry_items ?? []) {
      if (item.confidence === "low") b.hasLowConfidence = true;
      const n = item.nutrients ?? {};
      for (const k of keys) {
        const v = (n as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          b.totals[k] += v;
        }
      }
    }
  }

  // Final pass: flip hasUpperLimitExcess where any UL was crossed.
  // Cheap to walk all buckets × the 12 UL keys; we already have full
  // totals in hand from the entry accumulation above, so no extra
  // fetch.
  if (upperLimits) {
    const ulKeys = Object.keys(upperLimits) as UpperLimitKey[];
    for (const b of buckets) {
      if (b.entryCount === 0) continue;
      for (const k of ulKeys) {
        const meta = upperLimits[k];
        const v = b.totals[k];
        if (meta && typeof v === "number" && v > meta.value) {
          b.hasUpperLimitExcess = true;
          break;
        }
      }
    }
  }

  return { from: start, to: endDay, buckets };
}

/**
 * Cherry-pick the Nutrients fields from a daily_goals row. Equivalent to
 * profile.ts's stripGoalMetadata but kept local so totals.ts doesn't
 * have to import a private helper. Returns a fully-zeroed Nutrients
 * with any present numeric fields filled in — non-numeric / missing
 * fields stay at 0, which is the right default for both targets and
 * ceilings in the rendering layer.
 */
function stripToNutrients(row: Record<string, unknown>): Nutrients {
  const out = zeroNutrients();
  const keys = Object.keys(out) as NutrientKey[];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// ----- Range derived stats -------------------------------------------------

/**
 * Headline stats computed from a RangeData. Pure function — the page
 * computes these once and threads them into the scorecard component.
 *
 * Definitions:
 *   - `daysLogged`: buckets where entryCount > 0.
 *   - `avgCalories`: average totals.calories_kcal across logged days
 *     (not all days — averaging zeros from un-logged days makes the
 *     number meaningless for "what does my actual eating look like").
 *   - `daysHitCalorieTarget`: days within ±20% of the calorie target.
 *     Wider than just "≥ target" because both under-eating and
 *     over-eating count as misses for someone aiming at maintenance.
 *   - `longestGreenStreak`: longest consecutive run of green days.
 *     A green day = at least 80% of nutrients-with-targets are in range
 *     (mirror of plan §8). Days without entries break the streak.
 *   - `bestDay` / `worstDay`: bucket date strings for the highest /
 *     lowest greenScore. Ties broken by chronological order.
 */
export type RangeStats = {
  totalDays: number;
  daysLogged: number;
  avgCalories: number;
  daysHitCalorieTarget: number;
  longestGreenStreak: number;
  bestDay: string | null;
  worstDay: string | null;
  /** Number of buckets where hasUpperLimitExcess is true. The
   *  chronic-exposure indicator from plan §15: a single high-iron day
   *  is fine for almost everyone, but ten in a row is a signal
   *  worth surfacing. We don't bucket "in last 7 days" as the open
   *  question suggested — the user picks the range, and the count
   *  scales naturally with whatever window they're inspecting. */
  daysOverUpperLimit: number;
};

const TRACKED_NUTRIENTS: NutrientKey[] = [
  "protein_g",
  "fiber_g",
  "calcium_mg",
  "iron_mg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "potassium_mg",
  "sodium_mg",
  "saturated_fat_g",
  "added_sugar_g",
];

export function computeRangeStats(data: RangeData): RangeStats {
  const totalDays = data.buckets.length;
  const logged = data.buckets.filter((b) => b.entryCount > 0);
  const daysLogged = logged.length;

  const avgCalories =
    logged.length > 0
      ? Math.round(
          logged.reduce((s, b) => s + b.totals.calories_kcal, 0) /
            logged.length,
        )
      : 0;

  let daysHitCalorieTarget = 0;
  for (const b of logged) {
    const target = b.goals?.calories_kcal ?? 0;
    if (target <= 0) continue;
    const ratio = b.totals.calories_kcal / target;
    if (ratio >= 0.8 && ratio <= 1.2) daysHitCalorieTarget += 1;
  }

  // Per-day green score = fraction of TRACKED_NUTRIENTS in range.
  // For target-semantic nutrients: ≥ 80% of target.
  // For ceiling-semantic nutrients: ≤ 100% of ceiling.
  function greenScore(b: RangeBucket): number {
    if (!b.goals || b.entryCount === 0) return 0;
    let inRange = 0;
    let counted = 0;
    for (const k of TRACKED_NUTRIENTS) {
      const goal = b.goals[k];
      if (!(goal > 0)) continue;
      counted += 1;
      const v = b.totals[k];
      if (NUTRIENT_SEMANTICS[k] === "target") {
        if (v >= 0.8 * goal) inRange += 1;
      } else {
        if (v <= goal) inRange += 1;
      }
    }
    return counted === 0 ? 0 : inRange / counted;
  }

  let longest = 0;
  let current = 0;
  let bestDay: string | null = null;
  let worstDay: string | null = null;
  let bestScore = -1;
  let worstScore = 2; // > any real score so the first logged day takes it.
  for (const b of data.buckets) {
    const score = greenScore(b);
    if (b.entryCount > 0 && score >= 0.8) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
    if (b.entryCount > 0) {
      if (score > bestScore) {
        bestScore = score;
        bestDay = b.date;
      }
      if (score < worstScore) {
        worstScore = score;
        worstDay = b.date;
      }
    }
  }

  const daysOverUpperLimit = data.buckets.filter(
    (b) => b.hasUpperLimitExcess,
  ).length;

  return {
    totalDays,
    daysLogged,
    avgCalories,
    daysHitCalorieTarget,
    longestGreenStreak: longest,
    bestDay,
    worstDay,
    daysOverUpperLimit,
  };
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
  /** True if any UL was crossed on this day. Drives the red corner dot
   *  on the month calendar (M8 phase 2). Only populated when the
   *  caller passes an `upperLimits` argument to getMonthCaloriesByDay
   *  — without it we don't know which thresholds to check, and
   *  defaulting to false means callers that haven't opted in still get
   *  a calendar with no false positives. */
  hasUpperLimitExcess: boolean;
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
  day: Date,
  /** Optional UL map from computeUpperLimits(profile). When provided,
   *  each cell's hasUpperLimitExcess flag is computed from per-day
   *  totals of the UL-relevant nutrients. When omitted, the flag stays
   *  false. */
  upperLimits?: Partial<Record<UpperLimitKey, UpperLimitMeta>>,
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

  // We only need to accumulate the UL-relevant nutrients per day.
  // Pulling all 32 fields would work but waste cycles when the
  // calendar only shows calories + an excess flag.
  const ulKeys = upperLimits
    ? (Object.keys(upperLimits) as UpperLimitKey[])
    : [];

  const out = new Map<string, DayCaloriesCell>();
  /** Per-day running sums of UL-relevant nutrients, only populated if
   *  ulKeys is non-empty. Kept separate from `out` so DayCaloriesCell
   *  doesn't bloat with fields the renderer doesn't use. */
  const ulSums = new Map<string, Partial<Record<UpperLimitKey, number>>>();

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
      hasUpperLimitExcess: false,
    };
    cell.entryCount += 1;
    const sums = ulSums.get(key) ?? {};
    for (const item of entry.entry_items ?? []) {
      const cal = item.nutrients?.calories_kcal;
      if (typeof cal === "number" && Number.isFinite(cal)) {
        cell.calories += cal;
      }
      if (item.confidence === "low") cell.hasLowConfidence = true;
      for (const k of ulKeys) {
        const v = item.nutrients?.[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          sums[k] = (sums[k] ?? 0) + v;
        }
      }
    }
    out.set(key, cell);
    if (ulKeys.length > 0) ulSums.set(key, sums);
  }

  // Second pass: flip hasUpperLimitExcess where any UL key crossed.
  // Cheap (≤ 12 keys × ≤ 31 days) and keeps the per-entry loop
  // focused on accumulation.
  if (upperLimits) {
    for (const [date, cell] of out.entries()) {
      const sums = ulSums.get(date) ?? {};
      for (const k of ulKeys) {
        const v = sums[k];
        const meta = upperLimits[k];
        if (v != null && meta && v > meta.value) {
          cell.hasUpperLimitExcess = true;
          break;
        }
      }
    }
  }

  return out;
}
