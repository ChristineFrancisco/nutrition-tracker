# Nutrition Tracker

A personal nutrition tracker where you snap photos of meals throughout the day, an AI vision model estimates calories and nutrients, and the app rolls results up against either the FDA's generic Daily Values or personalized DRI-based targets.

See [`plan.md`](./plan.md) for the full product + implementation plan.

## Current status

**Milestone 1: Scaffolding — done.** Next.js 14 (App Router) + TypeScript + Tailwind + Supabase magic-link auth. Unauthenticated visitors land on `/login`; signed-in users land on a protected `/today` stub.

Next milestone: **M2 — Profile & goals.**

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

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
# then edit .env.local with the Supabase values from step 2
```

### 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`. Enter your email, click the link in your inbox, and you'll land on `/today`.

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
├── plan.md                       ← product + implementation plan
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              → redirects to /today
│   │   ├── globals.css
│   │   ├── login/                → magic-link sign-in
│   │   │   ├── page.tsx
│   │   │   └── actions.ts
│   │   ├── auth/
│   │   │   ├── callback/route.ts → code-for-session exchange
│   │   │   └── signout/route.ts
│   │   └── today/page.tsx        → protected landing page
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts         → browser client
│   │       ├── server.ts         → RSC / Server Action client
│   │       └── middleware.ts     → session refresh + route gate
│   └── middleware.ts             → Next.js edge middleware entry
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## What's coming next

- **M2 — Profile & goals:** profile form, FDA-vs-DRI target mode choice, Mifflin–St Jeor + DRI computation.
- **M3 — Capture & store:** camera input, Supabase Storage, `entries` table.
- **M4 — AI estimator:** `NutritionEstimator` interface and Claude vision adapter.
- **M5–M7:** rollups, history & filtering, polish.

See [`plan.md`](./plan.md) §10 for the full milestone breakdown.
