-- ============================================================
-- Nutrition Tracker — initial schema
-- Run in Supabase SQL Editor after creating your project.
-- Safe to re-run: everything is wrapped in "if not exists".
-- ============================================================

-- ---------- 1. profiles ----------
-- One row per auth user. Created automatically by a trigger on
-- auth.users insert. `target_mode` picks FDA generic vs personalized DRI.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  target_mode text not null default 'generic'
    check (target_mode in ('generic', 'personalized')),
  sex text check (sex in ('male', 'female', 'other')),
  birth_date date,
  height_cm numeric,
  weight_kg numeric,
  activity_level text check (activity_level in
    ('sedentary','light','moderate','active','very_active')),
  photo_retention_hours integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 2. daily_goals ----------
-- Snapshot of the user's computed targets at a point in time. Historical
-- reports reference whichever snapshot was active when the entry was eaten,
-- so later profile edits don't retroactively rewrite old rollups.
create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_from timestamptz not null default now(),
  source text not null default 'auto' check (source in ('auto','manual')),
  calories_kcal numeric,
  protein_g numeric, carbs_g numeric, fat_g numeric,
  saturated_fat_g numeric, trans_fat_g numeric,
  fiber_g numeric, sugar_g numeric, added_sugar_g numeric,
  sodium_mg numeric, potassium_mg numeric, calcium_mg numeric,
  iron_mg numeric, magnesium_mg numeric,
  vitamin_a_mcg numeric, vitamin_c_mg numeric, vitamin_d_mcg numeric,
  vitamin_e_mg numeric, vitamin_k_mcg numeric,
  b12_mcg numeric, folate_mcg numeric,
  created_at timestamptz not null default now()
);

create index if not exists daily_goals_user_effective_idx
  on public.daily_goals (user_id, effective_from desc);

-- ---------- 3. entries ----------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  eaten_at timestamptz not null default now(),
  photo_path text,              -- Supabase Storage path; null after 24h cleanup
  photo_expires_at timestamptz, -- when the photo will be auto-deleted
  user_note text,
  model_notes text,
  status text not null default 'pending'
    check (status in ('pending','analyzed','failed')),
  created_at timestamptz not null default now()
);

create index if not exists entries_user_eaten_idx
  on public.entries (user_id, eaten_at desc);

create index if not exists entries_photo_expires_idx
  on public.entries (photo_expires_at)
  where photo_path is not null;

-- ---------- 4. entry_items ----------
create table if not exists public.entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  name text not null,
  estimated_serving text,
  confidence text check (confidence in ('low','medium','high')),
  reasoning text,
  nutrients jsonb not null default '{}'::jsonb,
  user_edited boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists entry_items_entry_idx
  on public.entry_items (entry_id);

-- ---------- 5. Row Level Security ----------
alter table public.profiles     enable row level security;
alter table public.daily_goals  enable row level security;
alter table public.entries      enable row level security;
alter table public.entry_items  enable row level security;

-- profiles
drop policy if exists "profiles: owner read"   on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;
drop policy if exists "profiles: owner insert" on public.profiles;
create policy "profiles: owner read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner update"
  on public.profiles for update using (auth.uid() = id);
create policy "profiles: owner insert"
  on public.profiles for insert with check (auth.uid() = id);

-- daily_goals
drop policy if exists "goals: owner all" on public.daily_goals;
create policy "goals: owner all"
  on public.daily_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- entries
drop policy if exists "entries: owner all" on public.entries;
create policy "entries: owner all"
  on public.entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- entry_items: tied to entries by entry_id
drop policy if exists "entry_items: owner all" on public.entry_items;
create policy "entry_items: owner all"
  on public.entry_items for all
  using (
    exists (
      select 1 from public.entries e
      where e.id = entry_items.entry_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.entries e
      where e.id = entry_items.entry_id and e.user_id = auth.uid()
    )
  );

-- ---------- 6. updated_at trigger for profiles ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();
