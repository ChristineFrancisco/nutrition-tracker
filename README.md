# Nutrition Tracker

A personal nutrition tracker where you snap photos of meals throughout the day, an AI vision model estimates calories and nutrients, and the app rolls results up against either the FDA's generic Daily Values or personalized DRI-based targets.

See [`plan.md`](./plan.md) for the full product + implementation plan.

## Current status

**M1 — Scaffolding:** done. Next.js (App Router) + TypeScript + Tailwind + Supabase magic-link auth. Unauthenticated visitors land on `/login`; signed-in users go to `/today`.

**M2 — Profile & goals:** done. First-run onboarding at `/onboarding` lets you pick FDA generic targets or personalized DRI. The profile form at `/profile` (age, sex, height, weight, activity level, goal) drives a Mifflin–St Jeor + DRI computation and auto-switches you to personalized mode on save. `/goals` shows the current targets with a one-click switch back to FDA generic. Goals are upserted one-per-user-per-day.

**M3 — Capture & store:** done. The `/today` page has a camera/file-picker capture form that compresses photos client-side (1600px longest edge, JPEG 0.85, EXIF stripped), uploads directly to Supabase Storage, and creates a `pending` entry row. The feed shows each meal as a card with status badge (Analyzing / Analyzed / Failed / Not food), time, and photo-expiration countdown. Delete has an "are you sure" confirmation. Photos auto-expire after 7 days; the DB schema for the not-food rejection flow is already in place so M4 can wire up the AI short-circuit without another migration.

**M4 — AI estimator (core loop):** done. A `NutritionEstimator` interface abstracts the provider; the first adapter uses Google Gemini 2.5 Flash (free tier covers typical personal use) via the `@google/genai` SDK with vision. The system prompt enforces a strict JSON schema — Gemini's `responseMimeType: "application/json"` forces raw JSON output — plus a single-prompt "not food" short-circuit; Zod validates every response before it hits the DB. The capture flow now: upload → create pending entry → fire `analyzeEntry` async → server signs a short-lived URL, calls the model, writes `entry_items` + flips the entry to `analyzed` / `rejected` / `failed`. A per-user 20 analyses / 24h rolling cap guards against runaway costs. The note field is prominent and framed as "help the AI identify ambiguous food" — user notes render as a quoted pull-quote on each card. Entry-detail editing (manual item edits) is deferred to M4.5.

**Theme:** light / dark toggle (bottom-right) with an Eggshell-and-Rusty-Spice palette in light mode and the original zinc-and-green look in dark. Preference persists in `localStorage`; first-time visitors get their OS preference.

Next milestone: **M5 — Today rollups** (totals vs. goals, progress rings, good/bad highlight chips).

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
├── supabase/
│   └── migrations/                    ← SQL, applied via the Supabase SQL Editor
│       ├── 0001_initial_schema.sql
│       ├── 0002_storage_bucket.sql
│       ├── 0003_onboarding.sql
│       ├── 0004_daily_goals_one_per_day.sql
│       └── 0005_retention_and_rejected_status.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx                 → pre-hydration theme script + ThemeToggle mount
│   │   ├── page.tsx                   → redirects to /today
│   │   ├── globals.css                → light/dark CSS variables + brand palette
│   │   ├── login/                     → magic-link sign-in
│   │   ├── auth/                      → callback + signout routes
│   │   ├── onboarding/                → first-run target-mode picker
│   │   ├── profile/                   → profile form + saveProfile action
│   │   ├── goals/                     → goals view + switchToGeneric action
│   │   └── today/                     → capture form, feed, createEntry/deleteEntry
│   ├── components/
│   │   └── ThemeToggle.tsx            → fixed-position light/dark switch
│   ├── lib/
│   │   ├── entries.ts                 → today-feed query + signed-URL helper
│   │   ├── image.ts                   → client-side compression (canvas, JPEG 0.85)
│   │   ├── profile.ts                 → profile + goals helpers (upsert one/day)
│   │   ├── estimator/                 → NutritionEstimator interface + Gemini Flash adapter
│   │   ├── targets/                   → FDA generic values, DRI tables, computeGoals
│   │   └── supabase/                  → browser / server / middleware clients
│   └── middleware.ts                  → session refresh + route gate
├── next.config.mjs
├── tailwind.config.ts                 → darkMode: "class", brand scale via CSS vars
├── tsconfig.json
└── package.json
```

## What's coming next

- **M4.5 — Entry detail + manual edits:** per-entry page with the model's itemization, editable servings, add/remove items, delete from detail view.
- **M5 — Rollups:** aggregate today's analyzed entries against the daily goals and render progress bars + good/bad highlight chips.
- **M6 — History & filtering:** prior days, date-range views, per-nutrient trends.
- **M7 — Polish:** automatic photo cleanup (cron), empty states, accessibility sweep.

See [`plan.md`](./plan.md) §10 for the full milestone breakdown.
