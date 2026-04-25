# Nutrition Tracker — Implementation Plan

## 1. Product summary

A personal nutrition tracker where the user snaps photos of food throughout the day, an AI vision model estimates nutrition, and the app rolls results up against personalized FDA daily targets. Users filter history by day, month, or a custom date range to see when they hit their goals.

Core loop: **snap → estimate → log → review.**

## 2. Decisions locked in

- **Stack:** Next.js 14 (App Router) full-stack app written in TypeScript. React Server Components for reads, Route Handlers / Server Actions for writes and AI calls.
- **AI provider:** abstracted behind a `NutritionEstimator` interface so Gemini, Claude, OpenAI, or any future vision model can slot in without touching UI code. Initial implementation ships a Google Gemini 2.5 Flash adapter (free tier covers typical personal use); swapping is a one-file change.
- **Data store:** Supabase (Postgres + Auth + Storage). Photos in Supabase Storage, structured data in Postgres, Row Level Security per user.
- **Targets:** user chooses at onboarding between **Generic FDA Daily Values** (no personal info, 2,000 kcal reference) and **Personalized DRI-based** (requires age + biological sex, optional height/weight/activity for calorie accuracy). Switchable later in Settings.

## 3. High-level architecture

```
[Browser / PWA]
  ├── Camera / file picker  ──► uploads photo ──► Supabase Storage
  ├── Next.js App Router pages (RSC)
  └── fetch('/api/entries/analyze')
            │
            ▼
[Next.js server]
  ├── Auth middleware (Supabase session cookie)
  ├── /api/entries/analyze  → NutritionEstimator.analyze(photoUrl)
  ├── /api/entries          → CRUD
  ├── /api/profile          → profile + targets
  └── /api/reports          → day/month/range rollups
            │
            ▼
[Supabase]
  ├── Postgres (profiles, entries, entry_items, goals)
  ├── Storage (food-photos bucket, per-user folder)
  └── Auth (email magic link)
```

Key property: the AI key never reaches the browser. The client uploads a photo, then calls the server, which signs a temporary URL for the model and persists the structured result.

## 4. The `NutritionEstimator` abstraction

```ts
type Nutrients = {
  calories_kcal: number;
  // macros
  protein_g: number; carbs_g: number; fat_g: number;
  saturated_fat_g: number; trans_fat_g: number;
  fiber_g: number; sugar_g: number; added_sugar_g: number;
  // minerals
  sodium_mg: number; potassium_mg: number; calcium_mg: number;
  iron_mg: number; magnesium_mg: number;
  // vitamins
  vitamin_a_mcg: number; vitamin_c_mg: number; vitamin_d_mcg: number;
  vitamin_e_mg: number; vitamin_k_mcg: number;
  b12_mcg: number; folate_mcg: number;
  // summary flags (model-assigned)
  good_highlights: string[];   // e.g. ["high fiber", "omega-3"]
  bad_highlights: string[];    // e.g. ["high sodium", "added sugar"]
};

type EstimatedItem = {
  name: string;
  estimated_serving: string;     // "1 cup", "~150g"
  confidence: "low" | "medium" | "high";
  nutrients: Nutrients;
};

type AnalyzeResult =
  | {
      status: "ok";
      items: EstimatedItem[];
      totals: Nutrients;
      modelNotes: string;
    }
  | {
      status: "rejected";
      reason: string; // short, user-facing, e.g. "This looks like a receipt, not food."
    };

interface NutritionEstimator {
  analyze(input: { imageUrl: string; userNote?: string }): Promise<AnalyzeResult>;
}
```

The prompt to the vision model asks it to: itemize visible foods, estimate portion sizes, return per-item nutrient numbers in the fixed schema above, flag visible uncertainty, and surface "good" vs "bad" highlights. Server validates the JSON response with Zod before persisting.

**Not-food short-circuit.** The same prompt instructs the model to inspect the image first and, if it can't identify any food, return `{status:"rejected", reason:"<short explanation>"}` instead of attempting analysis. This keeps us to a single round-trip (no pre-classifier pass) while capping the output tokens for non-food images at ~50 instead of ~600 — the input-token cost is unavoidable since the image is what drives it. The server writes these rows with `entries.status='rejected'` and `entries.rejection_reason=<reason>`; the Today feed shows a neutral "Not food" badge with the reason underneath so the user knows what happened.

## 5. Data model (Postgres)

```sql
profiles (
  id uuid pk references auth.users,
  display_name text,
  sex text check (sex in ('male','female','other')),
  birth_date date,
  height_cm numeric,
  weight_kg numeric,
  activity_level text check (activity_level in
    ('sedentary','light','moderate','active','very_active')),
  updated_at timestamptz
)

daily_goals (
  user_id uuid pk references profiles,
  calories_kcal numeric,
  protein_g numeric,
  -- ... full mirror of Nutrients targets
  computed_at timestamptz,
  source text  -- 'auto' | 'manual_override'
)

entries (
  id uuid pk,
  user_id uuid fk,
  eaten_at timestamptz,
  photo_path text,        -- Supabase Storage path
  user_note text,
  model_notes text,
  status text,            -- 'pending' | 'analyzed' | 'failed'
  created_at timestamptz
)

entry_items (
  id uuid pk,
  entry_id uuid fk,
  name text,
  estimated_serving text,
  confidence text,
  nutrients jsonb          -- full Nutrients shape
)
```

`entries.eaten_at` (not `created_at`) is what filters key off, so the user can back-date a photo they forgot to upload. All tables: RLS policy `user_id = auth.uid()`.

## 6. Targets — user chooses generic FDA or personalized DRI

Onboarding asks the user which mode they want, with a plain-English explanation:

- **Generic (FDA Daily Values)** — the one-size-fits-all numbers printed on nutrition labels, based on a 2,000 kcal reference diet. No personal info required. Good if the user wants a quick start or prefers not to enter health data.
- **Personalized (DRI-based)** — user enters age and biological sex (and optionally height, weight, activity level for calorie accuracy). The app computes targets from Dietary Reference Intakes, which vary by age and sex.

The choice is stored on the profile and can be switched later in Settings. Switching modes recomputes `daily_goals` and stores a new snapshot — historical reports keep whatever targets were in effect at the time (see "snapshot" below).

**Generic mode values:** static table from FDA label Daily Values (2,000 kcal reference, 2,300 mg sodium ceiling, 50 g added sugar ceiling, 28 g fiber, etc.).

**Personalized mode computation:**

- **Calories:** Mifflin–St Jeor BMR × activity multiplier (1.2 → 1.9). Falls back to a sex/age-banded default if weight/height aren't provided.
- **Macros:** protein 0.8 g/kg (floor) to 1.2 g/kg depending on activity; fat 20–35% of calories; carbs fill remainder; saturated fat ≤ 10% of calories; added sugar ≤ 10% of calories; fiber 14 g per 1000 kcal.
- **Sodium:** 2300 mg ceiling (AHA); potassium 3400 mg (M) / 2600 mg (F).
- **Vitamins & minerals:** DRI / RDA tables keyed on sex + age band; source is the NIH Office of Dietary Supplements. Values seeded into a static JSON file in the repo so we don't hit a network at request time.

The UI labels every target with its source ("FDA generic" or "Personalized DRI") so the user always knows what they're being measured against. Recomputed when the profile changes; stored snapshot in `daily_goals` so historical reports aren't retroactively rewritten when the user updates their profile.

A subset of vitamins and minerals also carries a **Tolerable Upper Intake Level (UL)** — the daily intake above which toxicity risk becomes meaningful. ULs sit alongside targets and ceilings as a third tier of the targets system and drive a separate "Excess intake" warning surface. See §15.

## 7. Screens

1. **Onboarding / profile** — collect profile, show computed targets, let user override.
2. **Today** — big camera button, today's photos as a grid, running totals vs targets as ring/bar charts, "good" and "bad" callouts.
3. **Entry detail** — photo, model's itemization, editable serving size and item list (model estimates can be wrong; users can remove items or type `x 2` to scale), confidence chips.
4. **History** — date picker with three filter modes:
   - **Day** — single date, same view as Today but historical.
   - **Month** — calendar heatmap colored by % of calorie target, tap a day to drill in.
   - **Range** — two-date picker, shows averages per day, best/worst days, streak of goal-met days, per-nutrient trend lines.
5. **Goals / profile edit** — view computed targets, toggle manual override per nutrient.

## 8. Filtering & reporting

One server function does the heavy lifting:

```ts
getReport({ from: Date, to: Date, groupBy: 'day' | 'week' | 'month' })
  → { buckets: Array<{ date, totals: Nutrients, goalHitMap: Record<nutrient, boolean> }> }
```

Postgres does the work with `date_trunc(groupBy, eaten_at)` and a join on the goals snapshot. "Goal hit" is defined per nutrient: good nutrients check `total ≥ target`, limit nutrients (sat fat, trans fat, sodium, added sugar) check `total ≤ ceiling`. A day is "green" if ≥ 80% of tracked nutrients are in range — threshold configurable later.

## 9. Photo capture UX

- On mobile: `<input type="file" accept="image/*" capture="environment">` for one-tap native camera. No custom getUserMedia unless we add live preview later.
- Compress client-side to ~1600px longest edge before upload (smaller bills, faster analysis).
- Optimistic UI: entry appears in Today's feed immediately with a "analyzing…" shimmer; real numbers stream in when the server call returns.
- Allow text-only entries ("bowl of oatmeal with banana") for when photographing isn't practical — same estimator interface, just no image.
- **Reference-object tip on the capture screen.** A dismissible hint reads: *"Include your hand, a fork, or a standard cup in the frame for better portion estimates."* The tip is persistent in a small help icon and surfaces the first three times the user opens the camera.
- **Online required.** No offline queue in v1. If the device is offline when the user tries to capture or log an entry, the capture button is disabled and a banner explains: *"You need to be online to log entries — nutrition analysis runs on our server."* `navigator.onLine` plus a heartbeat ping drives the banner.

## 10. Milestones

**M1 — Scaffolding (0.5 day)**
Next.js + TypeScript + Tailwind + Supabase client, auth via magic link, empty dashboard behind login.

**M2 — Profile & goals (0.5 day)**
Profile form, Mifflin–St Jeor + DRI computation, `daily_goals` snapshot, goals view.

**M3 — Capture & store (0.5 day)**
Camera input, client-side compression, upload to Supabase Storage, `entries` row created, photo renders in Today's feed.

**M4 — AI estimator (1 day)**
`NutritionEstimator` interface, first adapter, Zod schema, `/api/entries/analyze` endpoint, entry detail view with itemization and manual editing.

**M5 — Today rollups (0.5 day)**
Totals calculator, progress rings for calories + key macros, good/bad highlight chips.

**M6 — History & filtering (1 day)**
Day view, month heatmap, range view with trend lines, per-nutrient goal-hit logic.

**M7 — Polish (0.5 day)**
PWA manifest + service worker so "Add to Home Screen" feels native on phones, empty states, error handling on failed AI calls, rate limit on `/analyze`.

Total: ~4.5 engineering days for a working v1.

## 11. Estimation accuracy — full mitigation plan

Vision models are often off by 30–50% on portion size, and sometimes misidentify foods. We treat accuracy as a UX problem, not just a model problem:

1. **Always show confidence.** Each `EstimatedItem` carries a `confidence: low | medium | high` chip on the entry detail view. Low-confidence items get a yellow border.
2. **Always allow manual edit.** Users can rename items, change the serving size (with a slider and a numeric input), duplicate or delete items, or add missing items by hand. Nutrient totals recompute live.
3. **Reference-object hint at capture time.** See §9 — the capture screen suggests placing a hand, fork, or standard cup in the frame for better portion estimates.
4. **Flag low-confidence entries in history.** Day, month, and range views render a small ⚠ marker on any day whose entries include low-confidence items, and roll a "days with estimates flagged" count into the range report. Clicking the flag opens the offending entry for review.
5. **"Approximate" framing everywhere.** Rings and progress bars say *"~1,850 of 2,100 kcal"* with the tilde baked into the template. A footer on every rollup reads *"Values are AI estimates — tap any entry to review and adjust."*
6. **Nutrient-level confidence.** When the model returns explicit uncertainty (e.g. "sodium depends heavily on seasoning"), we surface that note on the nutrient row rather than a single aggregate confidence.

## 12. Cost — 20 analyses/day cap, with estimates

**Cap.** Hard per-user limit of 20 successful analyses per 24-hour rolling window, enforced in the `analyzeEntry` server action. A 21st attempt is marked `failed` with a user-facing message about the quota. Failed analyses (model errors, invalid JSON) don't count against the cap. Text-only entries are free and uncapped.

**Provider: Google Gemini 2.5 Flash.** Picked because the free tier is generous enough to cover typical personal use without a billing setup — a solo user logging ~5 photos/day rarely touches the paid rails. Accuracy on food photos is comparable to Claude Haiku in our testing, and the `@google/genai` SDK supports `responseMimeType: "application/json"` so we get schema-clean JSON without the prefill trick.

**Free tier** (Google AI Studio, as of early 2026 — verify at https://ai.google.dev/gemini-api/docs/rate-limits):

- Gemini 2.5 Flash: free tier with double-digit RPM and a few hundred requests per day per project.

**Pay-as-you-go pricing** (for when you exceed free-tier limits):

- Gemini 2.5 Flash: **~$0.30 / 1M input tokens, ~$2.50 / 1M output tokens** (≤128K context; check the current pricing page before billing).

**Per-photo token budget** (based on a 1600px-longest-edge compressed JPEG plus our prompt and structured JSON reply):

- Image: ~300 tokens (Gemini charges a flat-ish token count per image for standard-resolution inputs).
- Prompt: ~500 input tokens.
- Structured JSON reply: ~600 output tokens.

**Per-photo cost (rounded, paid tier):**

| Model | Input cost | Output cost | Total per photo |
|---|---|---|---|
| Gemini 2.5 Flash | ~$0.0003 | ~$0.0015 | **~$0.002** |

**What that means at the 20/day cap (paid tier only):**

| Model | Max/user/day | Max/user/month | Realistic 5/day | Realistic/month |
|---|---|---|---|---|
| Gemini 2.5 Flash | ~$0.04 | **~$1.20** | ~$0.01 | **~$0.30** |

**Recommendation:** stay on the Gemini free tier for personal use. If daily photo volume climbs above the free-tier RPD or if the app is opened up to multiple users, enabling billing on the same Google Cloud project gets you onto pay-as-you-go at the rates above. Other adapters (Claude Haiku/Sonnet, OpenAI) are drop-in replacements via the `NutritionEstimator` interface — the system prompt in `src/lib/estimator/prompt.ts` is provider-agnostic.

Numbers above are Google's published rates as of early 2026 — verify on the Gemini pricing page before relying on them.

## 13. Privacy & photo retention

- **Bucket private by default.** Supabase Storage bucket is not publicly readable; photos are served to the user only via short-lived signed URLs.
- **Automatic 7-day photo deletion.** A scheduled Postgres function (or Supabase Edge Function cron) runs hourly and deletes any `entries.photo_path` past its `photo_expires_at` — both the Storage object and the `photo_path` column. The structured nutrition data (`entry_items.nutrients`, totals, date, notes) is preserved indefinitely; only the image is removed. 7 days = long enough to review a weekend's meals on Monday and catch portion-estimate mistakes; short enough to keep storage tiny (~50MB/week at the 20/day cap).
- **Transparent to the user.** The capture screen footer reads: *"Photos are automatically deleted 7 days after upload. Your nutrition data is kept."* Each entry card shows a countdown (*"photo will be removed in 3d 4h"*) while the image is still available, and a neutral placeholder afterward.
- **Configurable retention.** The `profiles.photo_retention_hours` column (default 168) lets us expose a user-facing slider (24h / 7d / 30d) later in Settings without a schema change. The value is read at insert time per entry, so changing it only affects future entries.
- **Explicit delete.** The entry detail screen has a "Delete entry" action that removes the photo from Storage immediately and deletes the entry + items rows.
- **Faces/receipts/locations.** EXIF stripped on upload (server-side) so GPS data doesn't survive. Auto-deletion further shrinks the exposure window.

## 14. Other open questions

- **FDA vs DRI semantics.** Resolved in §6 — the user chooses their mode at onboarding and can switch.
- **Offline.** No offline support in v1. See §9 — the UI clearly tells the user they need to be online to log entries.
- **Multi-device.** Supabase Auth handles this naturally; sign in on any device and data syncs.

## 15. Upper intake limits & overdose warnings

Some vitamins and minerals are toxic in excess — usually only when supplements or fortified foods stack with diet. The Institute of Medicine publishes a **Tolerable Upper Intake Level (UL)** for each: the highest daily intake unlikely to cause harm. We surface ULs distinct from the existing "ceiling" semantic so the user gets a clear, actionable warning when an entry pushes them past a known toxicity threshold, rather than burying it next to the soft sodium/sat-fat caps.

### How UL differs from "ceiling"

The current model has two semantics:

- **`target`** — aim for at least this much (protein, fiber, vitamin D, etc.). Going under is a miss; going over is fine.
- **`ceiling`** — keep below this much, ideally (sodium, saturated fat, added sugar). Going over fires a "Watch" chip — soft, advisory.

ULs are a third tier:

- **`upper_limit`** — going over crosses into a known-harmful range. A nutrient can have **both** a target and a UL: iron's RDA for adult women is 18 mg, the UL is 45 mg — it's normal and good to be between them; "Excess" only fires above 45.

The "Watch" chip on a ceiling means "tipped over a soft cap." A new "Excess" callout above a UL means "you've taken in more than is considered safe today." Different language, different color (red vs amber), and prioritized above the Watch list on the page.

### Nutrients in scope

ULs that matter most in practice — i.e. ones supplements or fortified foods can realistically push past:

- **Vitamin A (preformed, retinol)** — 3000 mcg RAE. Birth-defect and liver-toxicity risk. Distinct from beta-carotene, which has no UL.
- **Vitamin D** — 100 mcg (4000 IU). Hypercalcemia risk above this.
- **Vitamin E** — 1000 mg α-tocopherol. Bleeding risk.
- **Vitamin B6** — 100 mg. Peripheral neuropathy from chronic excess.
- **Niacin (B3)** — 35 mg of *added/synthetic* niacin only. Flushing, liver toxicity. Food niacin is uncapped.
- **Folate (folic acid)** — 1000 mcg of *synthetic* folic acid only. Masks B12 deficiency. Food folate is uncapped.
- **Iron** — 45 mg.
- **Zinc** — 40 mg. Chronic excess causes copper deficiency.
- **Selenium** — 400 mcg.
- **Calcium** — 2500 mg (adults <50) / 2000 mg (50+). Kidney-stone and hypercalcemia risk.
- **Magnesium** — 350 mg of *supplemental* magnesium only. Diarrhea/cramping. Food magnesium is uncapped.
- **Choline** — 3500 mg.

Vitamin C, vitamin K, B12, biotin, riboflavin, thiamin, pantothenic acid, manganese, copper, phosphorus, potassium have either no established UL or one so high that diet alone won't reach it; we don't surface a UL warning for those. Sodium stays a ceiling (2300 mg) — it's a long-term cardiovascular risk, not an acute toxicity, so the existing Watch language fits better.

### Data model

Extend the targets module to carry `upper_limit_*` for each nutrient that has one. Two flavors:

- **Total UL** — the warning fires off `totals[k]` directly. Most ULs work this way (vitamin A retinol, D, E, B6, iron, zinc, selenium, calcium, choline).
- **Source-restricted UL** — niacin, folic acid, and supplemental magnesium ULs apply to *added* / *synthetic* / *supplemental* intake only. For v1 we don't distinguish source in the data model. We apply the UL to the total and the warning copy notes that "supplements drive most of this — food sources alone usually don't reach this level." Later, we add an `is_supplement` flag (or a `source_kind` enum) on `entry_items` so the estimator can mark synthetic-source items and we sum those separately.

The DRI table extends naturally: where the existing fields specify the target, add the UL alongside. Generic FDA mode uses the same UL values (they're not personalized below the age band for most, except calcium, where the UL drops from 2500 to 2000 mg at age 50).

### UI surface

**Today / day view:**

- An "Excess intake" callout sits above the existing "Watch" chips when at least one UL is exceeded. Visually distinct: red border, alert icon, plain-language risk per nutrient (*"Iron — 51 mg of 45 mg upper safe limit. Chronic excess can cause GI distress and, over time, organ damage."*).
- The vitamin-grid bars get a fourth color tier above the UL: emerald-300/500/600 below it, then a red overflow segment for the part that crosses past. The bar visually "spills over" past the UL line so the user reads the magnitude at a glance.
- Nutrients with both a target and a UL show two reference ticks on their bar: the target tick and the UL tick, with the safe range between them shaded.

**History / month view:**

- Calendar cells get a small red dot in the corner on any day where a UL was exceeded (mirrors the existing low-confidence ⚠ marker, distinct color).
- The day view header includes a UL summary alongside the existing scorecard.
- Range view (when built) adds a per-nutrient "Days over upper limit" count.

**Entry detail / refine:**

- If a single item pushes a nutrient over its UL, surface a contextual hint on that item (*"This supplement contributes 200% DV of B6 — that's a heavy single dose."*). Helps the user decide whether to refine ("…actually only half a tablet") rather than ignoring the warning.

### Milestone

New **M8 — Upper-limit safety.** Slots after the current M7 polish work.

- Extend the targets module with `upper_limit_*` fields; update the FDA generic table and the DRI tables.
- Add `computeExcesses(totals, goals)` next to `computeHighlights` in `lib/totals.ts`, returning the same `Highlight[]` shape but for UL crossings.
- Build the "Excess intake" callout component; thread it through Today, day view, and (eventually) range view.
- Add the bar-overflow rendering tier in DailyTotals (target/limit/excess).
- Add the red corner dot in the month view's calendar cells.
- Document the source-restricted-nutrient caveat in user-visible copy on Goals page so the user understands why the warning fires (or doesn't) on niacin/folate/magnesium.

### Open question for later

Single-day vs chronic. A single 60-mg-iron day is fine for almost everyone; ten days in a row is not. The clinically meaningful signal is the trend, not the spike. Once the range view exists we add a "N days in last 7 over UL" chip — that's the chronic-exposure indicator. v1 of this feature warns per-day with copy that gently notes a single high day isn't usually harmful but the pattern matters.

## 16. Not in scope for v1

Barcode scanning, recipe library / meal templates, water tracking, exercise logging, multi-user households, export to Apple Health / Google Fit, social sharing. All are reasonable v2 candidates.
