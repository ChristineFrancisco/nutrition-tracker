-- ============================================================
-- M3 follow-ups:
--   1. Bump default photo retention from 24h to 168h (7 days).
--      24h felt aggressive — users couldn't review a week's meals on
--      Monday or catch portion-estimate mistakes over a weekend.
--   2. Add 'rejected' as a valid entries.status value + a
--      `rejection_reason` column, so the M4 AI estimator can mark images
--      that aren't food (e.g. random selfies, receipts) without wasting
--      tokens on a full analysis.
-- ============================================================

-- 1. Retention — change the column default for new users and update any
--    existing rows that are still on the old 24h default. Users who have
--    explicitly changed their retention (hypothetical — no UI yet) are
--    left alone.
alter table public.profiles
  alter column photo_retention_hours set default 168;

update public.profiles
  set photo_retention_hours = 168
  where photo_retention_hours = 24;

-- 2. Add 'rejected' to the allowed statuses.
alter table public.entries
  drop constraint if exists entries_status_check;

alter table public.entries
  add constraint entries_status_check
    check (status in ('pending','analyzed','failed','rejected'));

-- 3. Add a reason column for the M4 estimator to populate when it marks
--    an entry rejected. Short human-readable explanation we surface in
--    the UI — e.g. "This doesn't look like food — try another photo?"
alter table public.entries
  add column if not exists rejection_reason text;
