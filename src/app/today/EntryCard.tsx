"use client";

import { useState } from "react";
import DeleteEntryButton from "./DeleteEntryButton";
import RefineEntryForm from "./RefineEntryForm";
import RetryAnalyzeButton from "./RetryAnalyzeButton";
import type { EntryItem, EntryRow } from "@/lib/entries";
import type { Nutrients, NutrientKey } from "@/lib/targets/types";

/**
 * One entry on the day's feed, rendered as a row in a single-column
 * list. The collapsed row shows: thumbnail, time, a one-line description
 * (user_note for photo entries, status text for non-analyzed states),
 * the per-entry calorie sum, and a status pill. Clicking anywhere on the
 * row toggles an expanded panel below it that renders the user_note
 * quote, the AI's per-item breakdown, the Refine flow, and a small
 * Delete affordance.
 *
 * Description text follows a status priority:
 *   - pending  → "estimating…"           (italic muted)
 *   - failed   → model_notes             (red, line-clamp-2)
 *   - rejected → rejection_reason        (zinc-500, line-clamp-2)
 *   - analyzed → items joined by " · "   (zinc-500, single-line clamp)
 *   - else     → user_note               (zinc-500, single-line clamp)
 *   - fallback → "Photo"                 (italic muted)
 *
 * For analyzed entries we prefer the item list over the user_note because
 * it summarizes *what got logged* — useful for both photo entries (where
 * user_note is just a caption) and text entries (where user_note is the
 * verbose meal description). The full user_note still gets the quote
 * treatment in the expanded panel, so nothing is lost.
 *
 * Refine sits in the expanded panel because it's a deliberate action
 * (re-analyze burns a quota slot). Delete is small and tucked at the
 * bottom-right of the panel — reachable, never accidental.
 */
export default function EntryCard({
  entry,
  goals,
}: {
  entry: EntryRow;
  /** The user's daily goals for this entry's date. Used to compute %DV
   *  in the per-item nutrition label. Optional — when null we render the
   *  label without the %DV column. */
  goals?: Nutrients | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refining, setRefining] = useState(false);

  const timeLabel = new Date(entry.eaten_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const canRefine =
    entry.status === "analyzed" ||
    entry.status === "rejected" ||
    entry.status === "failed";

  // Anything worth a chevron on the row. Pending rows have nothing yet,
  // and a photo-only analyzed entry with no user_note + zero items would
  // be a degenerate case we haven't seen — collapsing isn't useful there
  // either.
  const hasExpandableContent = Boolean(
    entry.user_note ||
      (entry.status === "analyzed" && entry.items.length > 0) ||
      entry.status === "failed" ||
      canRefine,
  );

  function toggle() {
    setExpanded((v) => {
      if (v) setRefining(false);
      return !v;
    });
  }

  return (
    <li>
      <div
        className={`flex items-start gap-3 px-4 py-3 transition ${
          hasExpandableContent
            ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            : ""
        }`}
        onClick={hasExpandableContent ? toggle : undefined}
        role={hasExpandableContent ? "button" : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        aria-expanded={hasExpandableContent ? expanded : undefined}
        onKeyDown={
          hasExpandableContent
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        <Thumbnail entry={entry} />

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {timeLabel}
          </p>
          <Description entry={entry} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {entry.calories_kcal != null && (
            <p className="text-[15px] text-zinc-900 dark:text-zinc-100">
              ~
              <span className="font-bold">
                {Math.round(entry.calories_kcal).toLocaleString()}
              </span>{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">
                kcal
              </span>
            </p>
          )}
          <div className="flex items-center gap-1">
            <StatusBadge status={entry.status} />
            {hasExpandableContent && (
              <span
                aria-hidden
                className={`text-zinc-400 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 px-4 pb-4 pl-[5.25rem]">
          {entry.user_note && <UserNoteQuote text={entry.user_note} />}

          {entry.status === "analyzed" && entry.items.length > 0 && (
            <ItemsList items={entry.items} goals={goals ?? null} />
          )}

          {entry.status === "failed" && (
            <RetryAnalyzeButton entryId={entry.id} />
          )}

          {canRefine &&
            (refining ? (
              <RefineEntryForm
                entryId={entry.id}
                currentNote={entry.user_note ?? ""}
                entryType={entry.entry_type}
                onCancel={() => setRefining(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setRefining(true)}
                className="w-full rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100/70 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                Refine description &amp; re-analyze
              </button>
            ))}

          {entry.photo_expires_at && entry.photo_url && (
            <p className="text-[11px] text-zinc-400">
              {expiresInLabel(entry.photo_expires_at)}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <DeleteEntryButton entryId={entry.id} />
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * 56×56 thumbnail. Three modes:
 *   - text entry → ✍️ on a tinted square (matches the AddEntry chooser)
 *   - photo entry with photo_url → the actual image
 *   - photo entry, expired/missing → "photo expired" placeholder
 */
function Thumbnail({ entry }: { entry: EntryRow }) {
  const base = "h-14 w-14 shrink-0 overflow-hidden rounded-lg";

  if (entry.entry_type === "text") {
    return (
      <div
        className={`${base} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800`}
      >
        <span className="text-2xl" aria-hidden>
          ✍️
        </span>
      </div>
    );
  }

  if (entry.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.photo_url}
        alt={entry.user_note ?? "Meal photo"}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${base} flex flex-col items-center justify-center gap-0 bg-zinc-100 px-1 text-center dark:bg-zinc-800`}
    >
      <span className="text-[9px] font-medium uppercase leading-tight tracking-wide text-zinc-500 dark:text-zinc-400">
        photo
      </span>
      <span className="text-[9px] font-medium uppercase leading-tight tracking-wide text-zinc-500 dark:text-zinc-400">
        expired
      </span>
    </div>
  );
}

/**
 * One-line caption beneath the time. Picks the most informative thing
 * we can show given the entry's status — see the docblock at the top
 * for the priority order.
 */
function Description({ entry }: { entry: EntryRow }) {
  if (entry.status === "pending") {
    return (
      <p className="mt-0.5 text-sm italic text-zinc-400">estimating…</p>
    );
  }
  if (entry.status === "failed") {
    return (
      <p className="mt-0.5 line-clamp-2 text-sm text-red-700 dark:text-red-400">
        {entry.model_notes ?? "Analysis failed."}
      </p>
    );
  }
  if (entry.status === "rejected") {
    return (
      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
        {entry.rejection_reason ?? "Not food."}
      </p>
    );
  }
  // Analyzed: prefer the AI's item list joined with middle dots — it
  // summarizes the meal more usefully than echoing the user's free-text
  // caption/description (which is still available as the amber quote in
  // the expanded panel).
  if (entry.status === "analyzed" && entry.items.length > 0) {
    const joined = entry.items.map((it) => it.name).join(" · ");
    return (
      <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
        {joined}
      </p>
    );
  }
  // Fall back to user_note for any state that has one — text entries
  // always do; photo entries do when the user added a caption.
  if (entry.user_note) {
    return (
      <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
        {entry.user_note}
      </p>
    );
  }
  return <p className="mt-0.5 text-sm italic text-zinc-400">Photo</p>;
}

/**
 * The user's own description rendered as a quote in the expanded panel.
 * For photo entries this is the brief caption ("big salad, dressing on
 * the side"); for text entries it's the whole meal description. Same
 * styling either way so the user reads it as "the thing I typed."
 */
function UserNoteQuote({ text }: { text: string }) {
  return (
    <p className="border-l-2 border-amber-400/80 pl-3 text-sm italic text-zinc-700 dark:border-amber-500/60 dark:text-zinc-300">
      {text}
    </p>
  );
}

/**
 * Per-item list the AI returned. Each row collapses to `name — serving`
 * plus a macro chip line (kcal/P/C/F) and a confidence dot. Clicking the
 * row expands a nutrition-label-styled panel below it with the full
 * 32-field breakdown grouped FDA-style. State is kept per-row so the
 * user can compare two items side by side.
 */
function ItemsList({
  items,
  goals,
}: {
  items: EntryItem[];
  goals: Nutrients | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        What the AI identified
      </p>
      <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} goals={goals} />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({
  item,
  goals,
}: {
  item: EntryItem;
  goals: Nutrients | null;
}) {
  const [showNutrition, setShowNutrition] = useState(false);
  const hasNutrients = Object.keys(item.nutrients).length > 0;

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div
        className={`space-y-1 ${
          hasNutrients
            ? "cursor-pointer rounded-md px-1 -mx-1 transition hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40"
            : ""
        }`}
        onClick={hasNutrients ? () => setShowNutrition((v) => !v) : undefined}
        role={hasNutrients ? "button" : undefined}
        tabIndex={hasNutrients ? 0 : undefined}
        aria-expanded={hasNutrients ? showNutrition : undefined}
        onKeyDown={
          hasNutrients
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowNutrition((v) => !v);
                }
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {item.name}
            </span>
            {item.estimated_serving && (
              <span className="text-zinc-500 dark:text-zinc-400">
                {" — "}
                {item.estimated_serving}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {item.confidence && <ConfidenceDot level={item.confidence} />}
            {hasNutrients && (
              <span
                aria-hidden
                className={`text-zinc-400 transition-transform ${
                  showNutrition ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            )}
          </div>
        </div>
        {hasNutrients && <MacroChips n={item.nutrients} />}
        {item.reasoning && (
          <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
            {item.reasoning}
          </p>
        )}
      </div>
      {showNutrition && (
        <div className="mt-2">
          <NutritionLabel n={item.nutrients} goals={goals} />
        </div>
      )}
    </li>
  );
}

/**
 * Compact one-line macro summary. Shown under each item so the user can
 * scan macros without expanding. Uses tabular-nums + middle-dot
 * separators to feel like a label strip rather than running prose.
 */
function MacroChips({ n }: { n: Partial<Nutrients> }) {
  const parts: string[] = [];
  if (typeof n.calories_kcal === "number") {
    parts.push(`${Math.round(n.calories_kcal)} kcal`);
  }
  if (typeof n.protein_g === "number") {
    parts.push(`${roundG(n.protein_g)} g P`);
  }
  if (typeof n.carbs_g === "number") {
    parts.push(`${roundG(n.carbs_g)} g C`);
  }
  if (typeof n.fat_g === "number") {
    parts.push(`${roundG(n.fat_g)} g F`);
  }
  if (parts.length === 0) return null;
  return (
    <p className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
      {parts.join(" · ")}
    </p>
  );
}

/**
 * FDA-style "Nutrition Facts" panel for a single item. The visual
 * hierarchy mirrors the package label most users have seen on cereal
 * boxes:
 *   - Bold "Calories" line with thick rule above + below
 *   - Mandatory section: fats, cholesterol, sodium, carbs, protein
 *     (sub-rows indented for "of which" lines like saturated fat,
 *     fiber, sugars, added sugars)
 *   - Thick rule, then the FDA "must declare" micros: D / Ca / Fe / K
 *   - Thin rule, then the rest of the vitamins & minerals we track
 *
 * Rows whose nutrient is missing from the JSONB are skipped silently —
 * the model occasionally returns 0 for "we know it's zero" vs omitting
 * the key for "we didn't bother computing this", so we honor that.
 */
function NutritionLabel({
  n,
  goals,
}: {
  n: Partial<Nutrients>;
  goals: Nutrients | null;
}) {
  const showDv = goals !== null;
  return (
    <div className="rounded-md border-2 border-zinc-900 bg-white p-3 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100">
      <p className="text-base font-extrabold leading-none tracking-tight">
        Nutrition Facts
      </p>
      <div className="mt-1 border-t-2 border-zinc-900 dark:border-zinc-100" />

      {typeof n.calories_kcal === "number" && (
        <div className="flex items-baseline justify-between border-b-4 border-zinc-900 py-1 dark:border-zinc-100">
          <span className="text-sm font-extrabold">Calories</span>
          <span className="font-mono text-xl font-extrabold tabular-nums">
            {Math.round(n.calories_kcal)}
          </span>
        </div>
      )}

      {showDv && (
        // Tiny header row above the macros echoing FDA label convention —
        // only the rightmost column is meaningful here, the others are
        // visual scaffolding so the table reads as 3 columns from the top.
        <div className="grid grid-cols-[1fr_auto_3rem] gap-2 border-b border-zinc-300 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <span></span>
          <span></span>
          <span className="text-right">% DV*</span>
        </div>
      )}

      <LabelRow n={n} g={goals} k="fat_g" label="Total Fat" bold />
      <LabelRow n={n} g={goals} k="saturated_fat_g" label="Saturated Fat" indent />
      <LabelRow n={n} g={goals} k="trans_fat_g" label="Trans Fat" indent italic />
      <LabelRow n={n} g={goals} k="cholesterol_mg" label="Cholesterol" bold />
      <LabelRow n={n} g={goals} k="sodium_mg" label="Sodium" bold />
      <LabelRow n={n} g={goals} k="carbs_g" label="Total Carbohydrate" bold />
      <LabelRow n={n} g={goals} k="fiber_g" label="Dietary Fiber" indent />
      <LabelRow n={n} g={goals} k="sugar_g" label="Total Sugars" indent />
      <LabelRow n={n} g={goals} k="added_sugar_g" label="Added Sugars" indent={2} />
      <LabelRow n={n} g={goals} k="protein_g" label="Protein" bold />

      <div className="my-1 border-t-4 border-zinc-900 dark:border-zinc-100" />

      <LabelRow n={n} g={goals} k="vitamin_d_mcg" label="Vitamin D" />
      <LabelRow n={n} g={goals} k="calcium_mg" label="Calcium" />
      <LabelRow n={n} g={goals} k="iron_mg" label="Iron" />
      <LabelRow n={n} g={goals} k="potassium_mg" label="Potassium" />

      <LabelRow n={n} g={goals} k="vitamin_a_mcg" label="Vitamin A" topRule />
      <LabelRow n={n} g={goals} k="vitamin_c_mg" label="Vitamin C" />
      <LabelRow n={n} g={goals} k="vitamin_e_mg" label="Vitamin E" />
      <LabelRow n={n} g={goals} k="vitamin_k_mcg" label="Vitamin K" />
      <LabelRow n={n} g={goals} k="thiamin_mg" label="Thiamin (B1)" />
      <LabelRow n={n} g={goals} k="riboflavin_mg" label="Riboflavin (B2)" />
      <LabelRow n={n} g={goals} k="niacin_mg" label="Niacin (B3)" />
      <LabelRow n={n} g={goals} k="b6_mg" label="Vitamin B6" />
      <LabelRow n={n} g={goals} k="folate_mcg" label="Folate" />
      <LabelRow n={n} g={goals} k="b12_mcg" label="Vitamin B12" />
      <LabelRow n={n} g={goals} k="choline_mg" label="Choline" />
      <LabelRow n={n} g={goals} k="magnesium_mg" label="Magnesium" />
      <LabelRow n={n} g={goals} k="zinc_mg" label="Zinc" />
      <LabelRow n={n} g={goals} k="phosphorus_mg" label="Phosphorus" />
      <LabelRow n={n} g={goals} k="copper_mg" label="Copper" />
      <LabelRow n={n} g={goals} k="selenium_mcg" label="Selenium" />
      <LabelRow n={n} g={goals} k="manganese_mg" label="Manganese" />

      {showDv && (
        <p className="mt-2 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          * % Daily Value relative to your personal targets for this day.
          Ceiling nutrients (sodium, saturated fat, added sugar, cholesterol)
          show how much of your daily limit this item would use.
        </p>
      )}
    </div>
  );
}

function LabelRow({
  n,
  g,
  k,
  label,
  bold,
  indent,
  italic,
  topRule,
}: {
  n: Partial<Nutrients>;
  /** When non-null, render a third column with %DV computed against
   *  goals[k]. Null means the label renders as a 2-column grid. */
  g: Nutrients | null;
  k: NutrientKey;
  label: string;
  bold?: boolean;
  /** false/undefined = no indent, true = pl-3 ("of which..."), 2 = pl-6
   *  ("of which of which..." like Added Sugars under Total Sugars). */
  indent?: boolean | 2;
  italic?: boolean;
  /** Draws a thin rule above this row — used to delimit the "other"
   *  micros block from the FDA-must-declare block. */
  topRule?: boolean;
}) {
  const val = n[k];
  if (typeof val !== "number") return null;
  const indentClass = indent === 2 ? "pl-6" : indent ? "pl-3" : "";
  const labelClass = `${bold ? "font-bold" : ""} ${italic ? "italic" : ""}`;
  const showDv = g !== null;
  const gridCols = showDv
    ? "grid-cols-[1fr_auto_3rem]"
    : "grid-cols-[1fr_auto]";
  const rowClass = `grid ${gridCols} items-baseline gap-2 border-b border-zinc-300 py-0.5 text-sm dark:border-zinc-700 ${indentClass} ${
    topRule ? "border-t border-zinc-300 mt-1 dark:border-zinc-700" : ""
  }`;

  // %DV = item value / daily goal × 100. Skipped for nutrients with no
  // meaningful goal (sugar_g placeholder, trans_fat_g ceiling of 0, or
  // any other 0/missing target). FDA labels also omit %DV for trans fat,
  // so this matches user expectations.
  let dvText = "";
  if (showDv) {
    const goal = g[k];
    if (typeof goal === "number" && goal > 0) {
      const pct = Math.round((val / goal) * 100);
      dvText = `${pct}%`;
    }
  }

  return (
    <div className={rowClass}>
      <span className={labelClass}>{label}</span>
      <span className="font-mono tabular-nums text-right">
        {formatNutrientValue(val, NUTRIENT_UNIT[k])}
      </span>
      {showDv && (
        <span className="font-mono tabular-nums text-right text-zinc-700 dark:text-zinc-300">
          {dvText}
        </span>
      )}
    </div>
  );
}

/** Unit lookup for label rendering. Mirrors the unit field in
 *  NUTRIENT_LABELS but kept local so we don't have to import the whole
 *  metadata table just to read units in this component. */
const NUTRIENT_UNIT: Record<NutrientKey, "kcal" | "g" | "mg" | "mcg"> = {
  calories_kcal: "kcal",
  protein_g: "g",
  carbs_g: "g",
  fat_g: "g",
  saturated_fat_g: "g",
  trans_fat_g: "g",
  fiber_g: "g",
  sugar_g: "g",
  added_sugar_g: "g",
  cholesterol_mg: "mg",
  sodium_mg: "mg",
  potassium_mg: "mg",
  calcium_mg: "mg",
  iron_mg: "mg",
  magnesium_mg: "mg",
  zinc_mg: "mg",
  phosphorus_mg: "mg",
  copper_mg: "mg",
  selenium_mcg: "mcg",
  manganese_mg: "mg",
  vitamin_a_mcg: "mcg",
  vitamin_c_mg: "mg",
  vitamin_d_mcg: "mcg",
  vitamin_e_mg: "mg",
  vitamin_k_mcg: "mcg",
  b12_mcg: "mcg",
  folate_mcg: "mcg",
  thiamin_mg: "mg",
  riboflavin_mg: "mg",
  niacin_mg: "mg",
  b6_mg: "mg",
  choline_mg: "mg",
};

/** Round to 1 decimal under 10, integer above. Matches how packaged
 *  labels render (you see "0.5 g sat fat" but "120 mg sodium"). */
function roundG(v: number): string {
  if (v < 10) return v.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(v));
}

function formatNutrientValue(v: number, unit: "kcal" | "g" | "mg" | "mcg"): string {
  if (unit === "kcal") return `${Math.round(v)} kcal`;
  return `${roundG(v)} ${unit}`;
}

function ConfidenceDot({ level }: { level: "low" | "medium" | "high" }) {
  const color =
    level === "high"
      ? "bg-emerald-500"
      : level === "medium"
        ? "bg-amber-400"
        : "bg-zinc-400";
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
      title={`${level} confidence`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: EntryRow["status"] }) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
        Analyzing…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200">
        Failed
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
        Not food
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
      Analyzed
    </span>
  );
}

function expiresInLabel(isoExpiresAt: string): string {
  const ms = new Date(isoExpiresAt).getTime() - Date.now();
  if (ms <= 0) return "photo expiring";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `photo will be removed in ${days}d ${hours}h`;
  if (hours > 0) return `photo will be removed in ${hours}h ${minutes}m`;
  return `photo will be removed in ${minutes}m`;
}
