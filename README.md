# Nutrition Tracker

A personal nutrition tracker where you snap photos of meals throughout the day, an AI vision model estimates calories and nutrients, and the app rolls results up against either the FDA's generic Daily Values or personalized DRI-based targets.

See [`plan.md`](./plan.md) for the full product + implementation plan.

## Current status

**M1 — Scaffolding:** done. Next.js (App Router) + TypeScript + Tailwind + Supabase magic-link auth. Unauthenticated visitors land on `/login`; signed-in users go to `/today`.

**M2 — Profile & goals:** done. First-run onboarding at `/onboarding` lets you pick FDA generic targets or personalized DRI. The profile form at `/profile` (age, sex, height, weight, activity level, goal) drives a Mifflin–St Jeor + DRI computation and auto-switches you to personalized mode on save. `/goals` shows the current targets with a one-click switch back to FDA generic. Goals are upserted one-per-user-per-day.

**M3 — Capture & store:** done. The `/today` page has a camera/file-picker capture form that compresses photos client-side (1600px longest edge, JPEG 0.85, EXIF stripped), uploads directly to Supabase Storage, and creates a `pending` entry row. Photos auto-expire after 7 days; the DB schema for the not-food rejection flow is in place.

**M4 — AI estimator (core loop):** done. A `NutritionEstimator` interface abstracts the provider; the first adapter uses Google Gemini 2.5 Flash (free tier covers typical personal use) via the `@google/genai` SDK with vision. The system prompt enforces a strict 32-field nutrient schema — Gemini's `responseMimeType: "application/json"` forces raw JSON output — plus a single-prompt "not food" short-circuit; Zod validates every response before it hits the DB. The capture flow: upload → create pending entry → fire `analyzeEntry` async → server signs a short-lived URL, calls the model, writes `entry_items` + flips the entry to `analyzed` / `rejected` / `failed`. A per-user 20 analyses / 24h rolling cap guards against runaway costs. **Text-only entries** (no photo) ship via the same estimator with a text-only system prompt and `confidence` capped at "medium". **Refine + re-analyze** lets the user correct misidentifications and re-run on any analyzed/rejected/failed entry; **Retry** re-runs without prompts on failed ones.

**M5 — Today rollups:** done. `getTodayTotals` aggregates analyzed entries; `DailyTotals` renders a calorie ring, macro/sodium/fiber/sat-fat/added-sugar/cholesterol bars, deterministic good/watch chip strip, and a collapsible per-nutrient micros grid (vertical bar charts grouped vitamins / minerals).

**M6 — History & filtering:** done. **Day view** at `/history/[date]` reuses DailyTotals + the entry feed against the goals snapshot in effect on that date (so past totals aren't retroactively re-measured). **Week view** at `/history/week/[date]` mirrors Today's rollup chrome but with weekly totals summed across Monday → Sunday and weekly targets = daily goals × 7, plus a clickable per-day strip. **Month view** at `/history/month/[month]` is a calendar heatmap colored by % of calorie target. **Past-day logging:** the capture form is mounted on the historical day view too — you can backfill an entry you forgot to log when it happened, with safe rejection of future dates. **Range view** at `/history/range?from=&to=` (built but hidden from nav for now) supports arbitrary date windows with a scorecard + sparklines + per-day breakdown — will resurface if we need ad-hoc analysis later.

**M6.5 — Entry feed redesign:** done. The day's entries render as a single-column rounded list. Each row shows a thumbnail (photo or tile for text entries), time, a one-line description (analyzed entries show their AI-identified items joined with `·`), per-entry calories, and a status pill. Clicking a row reveals an inline panel with the user's quoted note, the AI's per-item list, a refine/re-analyze button, and (for failed entries) a retry. **Each item in the per-item list is itself clickable** and opens an FDA-style "Nutrition Facts" panel below it with the full 32-nutrient breakdown grouped exactly like a packaged-food label. A third **% Daily Value** column renders each nutrient's contribution against the user's daily goals for that specific date.

**Theme:** light / dark toggle (bottom-right) with an Eggshell-and-Rusty-Spice palette in light mode and the original zinc-and-green look in dark. Preference persists in `localStorage`; first-time visitors get their OS preference.

**M7 — Polish:** PWA shipped (manifest, service worker, app icons, install-prompt chip on Chromium, iOS apple-touch-icon + appleWebApp meta, theme-color tinting). Mobile responsiveness pass — headers stack on small screens, content shell widened. Outstanding: automatic photo cleanup cron, friendly rate-limit error UX, broader empty-state pass.

**M8 — Upper-intake / overdose warnings:** done. Tolerable Upper Intake Levels for 12 nutrients (vitamin A retinol 3000 mcg, D 100 mcg, E 1000 mg, B6 100 mg, niacin 35 mg, folic acid 1000 mcg, iron 45 mg, zinc 40 mg, selenium 400 mcg, calcium 2500/2000 mg by age, magnesium 350 mg supplemental, choline 3500 mg). Surfaced four ways: (1) a red **Excess intake** callout above DailyTotals on Today and the day-history view, with per-nutrient total/limit/% and a "supplements drive most of this" caveat for niacin / folic acid / supplemental magnesium; (2) red overflow cap + ring + red text on the micros grid bars when a UL is crossed; (3) red dot on month-calendar cells for any day a UL was crossed (distinct from the amber ⚠ low-confidence marker); (4) chronic-exposure stat in the range scorecard ("Over upper limit: N days", red when > 0) plus a per-day red dot in the breakdown list — see [`plan.md`](./plan.md) §15.

## Prerequisites

- Node.js 18.17 or later
- A free Supabase project (https://supabase.com)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. Open **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(keep this server-only — never ship it to the browser)*
3. Open **Authentication → URL Configuration** and set:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/auth/callback`
4. (Optional) Open **Authentication → Email Templates** and adjust the magic-link email template to your liking.

### 3. Get a Google Gemini API key (for AI analysis)

The AI nutrition estimator uses Gemini 2.5 Flash. You need an API key to use it — and Google's free tier is generous enough for personal use (no credit card required).

1. Go to https://aistudio.google.com/app/apikey and sign in with a Google account.
2. Click **Create API key**, choose a project (or let Google make one for you), and copy the value.
3. The free tier covers typical personal use. If you want higher rate limits or run out of free quota, enable billing on the same project — Gemini 2.5 Flash is inexpensive on pay-as-you-go.

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
# then edit .env.local with the Supabase values from step 2
# and your Gemini key from step 3
```

### 5. Apply database migrations

Open the Supabase dashboard's **SQL Editor** and run each file in `supabase/migrations/` in numeric order:

- `0001_initial_schema.sql` — profiles, daily_goals, entries tables + RLS
- `0002_storage_bucket.sql` — `food-photos` bucket and per-user path policy
- `0003_onboarding.sql` — `onboarded_at` / `target_mode` on profiles
- `0004_daily_goals_one_per_day.sql` — unique index so goals upsert one row per user per day
- `0005_retention_and_rejected_status.sql` — 7-day default retention + `rejected` entry status
- `0006_expand_nutrients.sql` — expand `daily_goals` and the `entry_items.nutrients` JSONB shape to the full 32-field Nutrients schema (added cholesterol, potassium, full vitamin/mineral set)
- `0007_entry_type.sql` — `entries.entry_type` column (`'photo' | 'text'`) so text-only entries can use the same table without a photo path

### 6. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`. Enter your email, click the link in your inbox, and you'll land on `/onboarding` the first time around; after picking a target mode you'll end up on `/today`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint via next lint. |
| `npm run typecheck` | `tsc --noEmit` — catches type errors without emitting files. |

## Project layout

```
nutrition-tracker/
├── plan.md                            ← product + implementation plan
├── public/
│   ├── manifest.webmanifest           ← PWA manifest (name/icons/theme/start_url)
│   ├── sw.js                          ← service worker (precache + cache-first static)
│   ├── apple-touch-icon.png           180×180 iOS home-screen icon
│   ├── favicon-16.png / favicon-32.png browser tab icons
│   └── icons/                         source SVGs + 192/512/maskable PNGs
├── supabase/
│   └── migrations/                    ← SQL, applied via the Supabase SQL Editor
│       ├── 0001_initial_schema.sql
│       ├── 0002_storage_bucket.sql
│       ├── 0003_onboarding.sql
│       ├── 0004_daily_goals_one_per_day.sql
│       ├── 0005_retention_and_rejected_status.sql
│       ├── 0006_expand_nutrients.sql
│       └── 0007_entry_type.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx                 → pre-hydration theme script, manifest+icon meta, SW + install-prompt mount
│   │   ├── page.tsx                   → redirects to /today
│   │   ├── globals.css                → light/dark CSS variables + brand palette
│   │   ├── login/                     → magic-link sign-in
│   │   ├── auth/                      → callback + signout routes
│   │   ├── onboarding/                → first-run target-mode picker
│   │   ├── profile/                   → profile form + saveProfile action
│   │   ├── goals/                     → goals view + switchToGeneric action
│   │   ├── today/                     → capture, feed, server actions
│   │   │   ├── page.tsx                  Today page composition
│   │   │   ├── AddEntry.tsx              tabbed photo / text-entry chooser (also used on history pages)
│   │   │   ├── CaptureForm.tsx           camera input + client-side compression flow
│   │   │   ├── TextEntryForm.tsx         no-photo description path
│   │   │   ├── DailyTotals.tsx           calorie ring + macro bars + chip strip + micros grid
│   │   │   ├── EntryCard.tsx             single-row layout + nutrition-label drilldown
│   │   │   ├── RefineEntryForm.tsx       refine + re-analyze textarea
│   │   │   ├── RetryAnalyzeButton.tsx    one-click retry on failed entries
│   │   │   ├── DeleteEntryButton.tsx     inline subtle delete with confirm
│   │   │   ├── ExpandableText.tsx        clamp-with-toggle helper
│   │   │   └── actions.ts                createEntry / createTextEntry / analyzeEntry / refineEntry / deleteEntry / parseEatenOnFromForm
│   │   └── history/
│   │       ├── [date]/page.tsx        day view with AddEntry + DailyTotals + entry feed
│   │       ├── month/[month]/page.tsx calendar heatmap colored by % of calorie target
│   │       └── range/                 date-range view: scorecard + sparklines + per-day list
│   │           ├── page.tsx              query-string-driven server component
│   │           ├── RangeDatePicker.tsx   client form (quick picks + custom dates)
│   │           ├── RangeScorecard.tsx    5-stat headline card
│   │           └── NutrientTrend.tsx     hand-rolled SVG sparkline per nutrient
│   ├── components/
│   │   ├── ThemeToggle.tsx            → fixed-position light/dark switch
│   │   ├── InstallPrompt.tsx          → emerald "Install app" chip on Chromium (beforeinstallprompt)
│   │   └── RegisterServiceWorker.tsx  → registers /sw.js in production builds
│   ├── lib/
│   │   ├── entries.ts                 → entry queries (today/date), per-item nutrients parsing, day/month boundaries
│   │   ├── totals.ts                  → totals aggregation, pctOf, computeHighlights, range data + stats
│   │   ├── image.ts                   → client-side compression (canvas, JPEG 0.85)
│   │   ├── profile.ts                 → profile + goals helpers (upsert one/day, getGoalsEffectiveOn snapshot lookup)
│   │   ├── estimator/                 → NutritionEstimator interface + Gemini Flash adapter (vision + text)
│   │   ├── targets/                   → FDA generic values, DRI tables, computeGoals, NUTRIENT_LABELS
│   │   └── supabase/                  → browser / server / middleware clients
│   └── middleware.ts                  → session refresh + route gate
├── next.config.mjs
├── tailwind.config.ts                 → darkMode: "class", brand scale via CSS vars
├── tsconfig.json
└── package.json
```

## What's coming next

- **M7 — Remaining polish:** automatic photo cleanup cron (the 7-day expiry is honored at read time but Storage objects aren't actively GC'd), friendly rate-limit error UX on `/analyze`, broader empty-state pass.

See [`plan.md`](./plan.md) §10 for the full milestone breakdown.
