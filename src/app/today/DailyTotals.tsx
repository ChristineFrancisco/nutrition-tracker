import {
  NUTRIENT_LABELS,
  type NutrientKey,
  type Nutrients,
} from "@/lib/targets/types";
import { computeHighlights, pctOf } from "@/lib/totals";
import type {
  UpperLimitKey,
  UpperLimitMeta,
} from "@/lib/targets/upper_limits";

/**
 * Today rollup panel. Shown above the entries grid on /today so the
 * user sees where they are against targets at a glance, then scrolls
 * to the per-meal cards for detail.
 *
 * Layout, top to bottom:
 *   1. Ring row — calories (big) + 3 macro rings (protein/carbs/fat).
 *   2. "Targets — fill toward goal" section: horizontal bars for the
 *      non-macro targets that matter daily (fiber is the main one).
 *   3. "Limits — budget remaining" section: bars framed as
 *      used/max with a prominent "X left" or "-X over" callout on
 *      the right. Sodium, sat fat, added sugar, cholesterol.
 *   4. "Vitamins & minerals" disclosure, collapsed by default:
 *      expands to a compact grid of vertical bars for every micro we
 *      track. Hidden by default because daily micronutrient variance
 *      is high enough to mislead on its own — the user can still look
 *      when curious.
 *   5. Good/Watch highlight chips computed deterministically from
 *      totals-vs-goals deltas.
 *
 * Empty state (no analyzed entries yet) short-circuits this whole
 * thing — an empty ring looks broken.
 *
 * Server component on purpose. The vitamin disclosure uses the native
 * HTML `<details>` element so we don't need client state.
 *
 * Per plan §11, every value carries a "~" prefix to frame numbers as
 * AI estimates.
 */
export default function DailyTotals({
  totals,
  goals,
  entryCount,
  upperLimits,
}: {
  totals: Nutrients;
  goals: Nutrients;
  entryCount: number;
  /** Optional UL meta map from computeUpperLimits(profile). When
   *  provided, the micros grid renders a red overflow cap on any
   *  nutrient whose total has crossed its UL. When omitted the grid
   *  reads identically to its pre-M8 behavior. */
  upperLimits?: Partial<Record<UpperLimitKey, UpperLimitMeta>>;
}) {
  if (entryCount === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Today so far
        </h2>
        <p>
          Nothing logged yet — your totals will show up here as you add
          meals.
        </p>
      </section>
    );
  }

  const { good, watch } = computeHighlights(totals, goals);
  const caloriesPct = pctOf(totals.calories_kcal, goals.calories_kcal);

  return (
    <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Today so far
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          {entryCount} {entryCount === 1 ? "meal" : "meals"} logged · all
          numbers are AI estimates
        </p>
      </div>

      {/* ----- Rings row ---------------------------------------------- */}
      <div>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Progress rings
        </h3>
        <div className="grid grid-cols-[1fr] gap-5 sm:grid-cols-[auto_1fr]">
          <CaloriesRing
            value={totals.calories_kcal}
            target={goals.calories_kcal}
            pct={caloriesPct}
          />
          <div className="grid grid-cols-3 gap-3">
            <MacroRing
              nutrientKey="protein_g"
              value={totals.protein_g}
              target={goals.protein_g}
            />
            <MacroRing
              nutrientKey="carbs_g"
              value={totals.carbs_g}
              target={goals.carbs_g}
            />
            <MacroRing
              nutrientKey="fat_g"
              value={totals.fat_g}
              target={goals.fat_g}
            />
          </div>
        </div>
      </div>

      {/* ----- Targets — fill toward goal ----------------------------- */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
          <span aria-hidden className="text-[12px]">
            ▲
          </span>
          Targets — fill toward goal
        </h3>
        <div className="space-y-3">
          <TargetBar
            nutrientKey="fiber_g"
            value={totals.fiber_g}
            target={goals.fiber_g}
          />
        </div>
      </div>

      {/* ----- Limits — budget remaining ------------------------------ */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
          <span aria-hidden className="text-[12px]">
            ▼
          </span>
          Limits — budget remaining
        </h3>
        <div className="space-y-3">
          <LimitBar
            nutrientKey="sodium_mg"
            value={totals.sodium_mg}
            ceiling={goals.sodium_mg}
          />
          <LimitBar
            nutrientKey="saturated_fat_g"
            value={totals.saturated_fat_g}
            ceiling={goals.saturated_fat_g}
          />
          <LimitBar
            nutrientKey="added_sugar_g"
            value={totals.added_sugar_g}
            ceiling={goals.added_sugar_g}
          />
          <LimitBar
            nutrientKey="cholesterol_mg"
            value={totals.cholesterol_mg}
            ceiling={goals.cholesterol_mg}
          />
        </div>
      </div>

      {/* ----- Vitamins & minerals (collapsible) ---------------------- */}
      <MicronutrientsDisclosure
        totals={totals}
        goals={goals}
        upperLimits={upperLimits}
      />

      {/* ----- Highlight chips ---------------------------------------- */}
      {(good.length > 0 || watch.length > 0) && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {good.slice(0, 4).map((h) => (
            <span
              key={`good-${h.key}`}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              title={`${Math.round(h.pct)}% of target`}
            >
              <span aria-hidden>✓</span>
              {h.label}
            </span>
          ))}
          {watch.map((h) => (
            <span
              key={`watch-${h.key}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
              title={`${Math.round(h.pct)}% of ceiling`}
            >
              <span aria-hidden>⚠</span>
              {h.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ----- Rings ---------------------------------------------------------------

function CaloriesRing({
  value,
  target,
  pct,
}: {
  value: number;
  target: number;
  pct: number;
}) {
  // Monochromatic emerald under goal, amber only when actually overshooting.
  // "Below target" is not a warning — it's just the state of the day so far.
  const tone =
    pct > 110
      ? "text-amber-500"
      : pct >= 80
        ? "text-emerald-600"
        : pct >= 50
          ? "text-emerald-500"
          : "text-emerald-300";
  return (
    <div className="flex items-center gap-3">
      <Ring size={128} stroke={12} pct={pct} toneClass={tone} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Calories
        </p>
        <p className="mt-0.5 text-2xl font-semibold leading-tight">
          ~{formatRound(value)}
          <span className="ml-1 text-sm font-normal text-zinc-400">kcal</span>
        </p>
        <p className="text-xs text-zinc-500">
          of ~{formatRound(target)} · {Math.round(pct)}%
        </p>
      </div>
    </div>
  );
}

function MacroRing({
  nutrientKey,
  value,
  target,
}: {
  nutrientKey: NutrientKey;
  value: number;
  target: number;
}) {
  const meta = NUTRIENT_LABELS[nutrientKey];
  const pct = pctOf(value, target);
  // Macros tolerate a bit more overshoot than calories before we flag it.
  const tone =
    pct > 120
      ? "text-amber-500"
      : pct >= 80
        ? "text-emerald-600"
        : pct >= 50
          ? "text-emerald-500"
          : "text-emerald-300";
  return (
    <div className="flex flex-col items-center gap-1">
      <Ring size={72} stroke={7} pct={pct} toneClass={tone} />
      <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
        {meta.label}
      </p>
      <p className="text-[11px] text-zinc-500">
        ~{formatShort(value)} / {formatShort(target)} {meta.unit}
      </p>
    </div>
  );
}

function Ring({
  size,
  stroke,
  pct,
  toneClass,
}: {
  size: number;
  stroke: number;
  pct: number;
  toneClass: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Clamp progress arc to a single loop so overshoot surfaces via
  // color + chips rather than a second lap around.
  const dash = c * Math.min(pct / 100, 1);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke="currentColor"
        className="text-zinc-200 dark:text-zinc-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={toneClass}
      />
    </svg>
  );
}

// ----- Target bar (fills toward goal) --------------------------------------

function TargetBar({
  nutrientKey,
  value,
  target,
}: {
  nutrientKey: NutrientKey;
  value: number;
  target: number;
}) {
  const meta = NUTRIENT_LABELS[nutrientKey];
  const pct = pctOf(value, target);
  // Same monochromatic emerald scale as the micronutrient bars below.
  const tone =
    pct >= 100
      ? "bg-emerald-600"
      : pct >= 50
        ? "bg-emerald-500"
        : "bg-emerald-300";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-100">
          {meta.label}
        </span>
        <span className="font-mono text-xs text-zinc-500">
          ~{formatShort(value)} / {formatShort(target)} {meta.unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${tone} transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

// ----- Limit bar (used vs max, with remaining callout) --------------------

function LimitBar({
  nutrientKey,
  value,
  ceiling,
}: {
  nutrientKey: NutrientKey;
  value: number;
  ceiling: number;
}) {
  const meta = NUTRIENT_LABELS[nutrientKey];
  const pct = pctOf(value, ceiling);
  const over = ceiling > 0 && value > ceiling;
  const remaining = ceiling - value;
  // Monochromatic amber: the whole Limits section reads as "budget"
  // at a glance, with intensity scaling as more of the budget is spent.
  // Amber at low usage is intentionally soft so it doesn't look alarmed.
  const tone = over
    ? "bg-amber-600"
    : pct >= 50
      ? "bg-amber-500"
      : "bg-amber-300";
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="space-y-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium text-zinc-800 dark:text-zinc-100">
            {meta.label}
          </span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            limit
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full ${tone} transition-all`}
            style={{ width: `${Math.min(pct, 100)}%` }}
            aria-hidden
          />
        </div>
        <div className="flex items-baseline justify-between font-mono text-[11px] text-zinc-500">
          <span>~{formatShort(value)} used</span>
          <span>
            {formatShort(ceiling)} {meta.unit} max
          </span>
        </div>
      </div>
      <div className="min-w-[64px] text-right">
        <p
          className={`font-mono text-lg font-semibold leading-none ${
            over
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-800 dark:text-zinc-100"
          }`}
        >
          {over ? "−" : ""}
          {formatShort(Math.abs(remaining))}
          <span className="ml-1 text-xs font-normal text-zinc-400">
            {meta.unit}
          </span>
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          {over ? "over" : "left"}
        </p>
      </div>
    </div>
  );
}

// ----- Micronutrient disclosure (collapsed by default) --------------------

/**
 * Nutrients shown inside the collapsed section. Sodium is intentionally
 * omitted here — it already lives in the Limits section as a ceiling
 * and repeating it would be redundant (and misleading: showing "sodium
 * at 80%" as a target-style fill would read as "almost there" when the
 * real story is "you have 20% of your budget left").
 */
const VITAMIN_KEYS: NutrientKey[] = [
  "vitamin_a_mcg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "vitamin_e_mg",
  "vitamin_k_mcg",
  "b12_mcg",
  "folate_mcg",
  "thiamin_mg",
  "riboflavin_mg",
  "niacin_mg",
  "b6_mg",
  "choline_mg",
];

const MINERAL_KEYS: NutrientKey[] = [
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "magnesium_mg",
  "zinc_mg",
  "phosphorus_mg",
  "copper_mg",
  "selenium_mcg",
  "manganese_mg",
];

/** Short labels for the vertical bars — full names don't fit. */
const SHORT_LABELS: Partial<Record<NutrientKey, string>> = {
  vitamin_a_mcg: "Vit A",
  vitamin_c_mg: "Vit C",
  vitamin_d_mcg: "Vit D",
  vitamin_e_mg: "Vit E",
  vitamin_k_mcg: "Vit K",
  b12_mcg: "B12",
  folate_mcg: "Folate",
  thiamin_mg: "B1",
  riboflavin_mg: "B2",
  niacin_mg: "B3",
  b6_mg: "B6",
  choline_mg: "Choline",
  potassium_mg: "Potas",
  calcium_mg: "Calcium",
  iron_mg: "Iron",
  magnesium_mg: "Mag",
  zinc_mg: "Zinc",
  phosphorus_mg: "Phos",
  copper_mg: "Copper",
  selenium_mcg: "Selen",
  manganese_mg: "Mang",
};

function MicronutrientsDisclosure({
  totals,
  goals,
  upperLimits,
}: {
  totals: Nutrients;
  goals: Nutrients;
  upperLimits?: Partial<Record<UpperLimitKey, UpperLimitMeta>>;
}) {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="text-xs text-zinc-400 transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          Vitamins &amp; minerals
        </span>
        <span className="text-[11px] font-normal text-zinc-400">
          click to show all {VITAMIN_KEYS.length + MINERAL_KEYS.length}
        </span>
      </summary>
      <div className="space-y-4 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Daily micronutrient intake varies a lot — don&apos;t panic over a
          low column on one day. The weekly view (coming soon) is more
          informative for these.
        </p>

        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Vitamins
          </h4>
          <VerticalBarGrid
            keys={VITAMIN_KEYS}
            totals={totals}
            goals={goals}
            upperLimits={upperLimits}
          />
        </div>

        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Minerals
          </h4>
          <VerticalBarGrid
            keys={MINERAL_KEYS}
            totals={totals}
            goals={goals}
            upperLimits={upperLimits}
          />
        </div>
      </div>
    </details>
  );
}

function VerticalBarGrid({
  keys,
  totals,
  goals,
  upperLimits,
}: {
  keys: NutrientKey[];
  totals: Nutrients;
  goals: Nutrients;
  upperLimits?: Partial<Record<UpperLimitKey, UpperLimitMeta>>;
}) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
      {keys.map((k) => {
        const ul = upperLimits?.[k as UpperLimitKey];
        return (
          <VerticalBar
            key={k}
            nutrientKey={k}
            value={totals[k]}
            target={goals[k]}
            upperLimit={ul?.value}
          />
        );
      })}
    </div>
  );
}

function VerticalBar({
  nutrientKey,
  value,
  target,
  upperLimit,
}: {
  nutrientKey: NutrientKey;
  value: number;
  target: number;
  /** UL for this nutrient, when one exists. When defined and `value`
   *  exceeds it, the bar gets a red overflow cap and the percentage
   *  text turns red. */
  upperLimit?: number;
}) {
  const meta = NUTRIENT_LABELS[nutrientKey];
  const pct = pctOf(value, target);
  const label = SHORT_LABELS[nutrientKey] ?? meta.label;
  const overUl = upperLimit != null && upperLimit > 0 && value > upperLimit;
  // Monochromatic emerald scale below UL: same hue, stronger saturation
  // as we approach the goal. Keeps the grid scannable as a "how full
  // is the day" view without any single tier reading as a warning.
  const tone =
    pct >= 100
      ? "bg-emerald-600"
      : pct >= 50
        ? "bg-emerald-500"
        : "bg-emerald-300";
  // Default (below-UL) fill: bottom-anchored, 0 → target. Clamp to 100%
  // for the fill but still surface >100% in the caption.
  const fillPct = Math.min(pct, 100);
  // Over-UL fill: switch reference frame to "0 → 2×UL" so the UL line
  // sits at 50% of the pill height. Red fill represents the actual
  // intake on that scale — 100% of UL fills half the pill, 150%
  // three-quarters, 200%+ pegs at full. Keeps the visual proportional
  // to the safety threshold instead of inventing a separate "cap"
  // segment that mixed two reference frames.
  const ulFillPct =
    overUl && upperLimit
      ? Math.min(100, (value / (2 * upperLimit)) * 100)
      : 0;
  const ulPctOfLimit = overUl && upperLimit
    ? Math.round((value / upperLimit) * 100)
    : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
        {label}
      </span>
      <div
        className={`relative h-16 w-5 overflow-hidden rounded-full ${
          overUl
            ? "bg-amber-100 ring-1 ring-red-400 dark:bg-amber-500/15 dark:ring-red-500/60"
            : "bg-zinc-200 dark:bg-zinc-800"
        }`}
        title={
          overUl
            ? `${meta.label}: ~${formatShort(value)} ${meta.unit} · ${Math.round(
                pct,
              )}% of target · ${ulPctOfLimit}% of upper safe limit (${formatShort(
                upperLimit ?? 0,
              )} ${meta.unit})`
            : `${meta.label}: ~${formatShort(value)} / ${formatShort(
                target,
              )} ${meta.unit} · ${Math.round(pct)}% of target`
        }
      >
        {overUl ? (
          <>
            <div
              aria-hidden
              className="absolute bottom-0 left-0 right-0 bg-red-500 transition-all dark:bg-red-600"
              style={{ height: `${ulFillPct}%` }}
            />
            {/* UL reference line at 50% of the pill — a thin dashed
                tick so the user can read "this is where the safe limit
                sits" without it dominating the fill. */}
            <div
              aria-hidden
              className="absolute left-0 right-0 border-t border-dashed border-red-700/50 dark:border-red-300/40"
              style={{ bottom: "50%" }}
            />
          </>
        ) : (
          <div
            aria-hidden
            className={`absolute bottom-0 left-0 right-0 ${tone} transition-all`}
            style={{ height: `${fillPct}%` }}
          />
        )}
      </div>
      <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
        {/* Once over UL the percentage label switches to read against
            the UL — that's the more important reference now ("you're
            150% of the safe limit" matters more than "you're 215% of
            target"). Keeps the on-screen number in the same scale as
            the bar fill. Color stays neutral (matching the nutrient
            name above) — the bar's fill color does the alerting; the
            number is informational. */}
        {overUl ? `${ulPctOfLimit}% UL` : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

// ----- Formatters ----------------------------------------------------------

function formatRound(n: number): string {
  return Math.round(n).toLocaleString();
}

/**
 * Short formatter — 1 decimal below 10 so micros like "0.4 mg" stay
 * legible, whole numbers above.
 */
function formatShort(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
