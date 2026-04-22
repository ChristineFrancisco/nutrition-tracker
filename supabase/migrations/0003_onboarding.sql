-- ============================================================
-- M2: track onboarding completion on the profile row.
-- Run AFTER 0001_initial_schema.sql.
-- ============================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Small convenience: index for the common "has this user finished
-- onboarding?" lookup we run on every /today hit.
create index if not exists profiles_onboarded_idx
  on public.profiles (id)
  where onboarded_at is null;
