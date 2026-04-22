-- ============================================================
-- Nutrition Tracker — collapse daily_goals to one row per user per day
--
-- Before this migration every profile save wrote a new snapshot. For an
-- MVP that produced clutter without much value — same-day edits usually
-- represent "I'm still filling this out", not "I had two different
-- targets today." This migration:
--
--   1. Prunes existing same-day duplicates (keeps the most recent row
--      per user per UTC day).
--   2. Adds a generated `effective_date` column derived from
--      effective_from — used as the unique-constraint key.
--   3. Adds a unique index on (user_id, effective_date) so subsequent
--      upserts collapse into the existing row for "today".
--
-- Cross-day history is preserved; historical reports can still look up
-- the snapshot in effect on a given date.
--
-- Timezone note: we collapse on UTC date. For a personal-use app this
-- is fine; multi-timezone support would add a profiles.timezone column
-- and use that instead.
-- ============================================================

-- 1. Prune existing duplicates, keeping the most recent row per
--    (user_id, UTC date of effective_from).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, (effective_from at time zone 'utc')::date
      order by effective_from desc, created_at desc
    ) as rn
  from public.daily_goals
)
delete from public.daily_goals dg
using ranked
where ranked.id = dg.id and ranked.rn > 1;

-- 2. Add a stored generated column for the conflict target.
--    STORED so it can be indexed; recomputes automatically when
--    effective_from changes.
alter table public.daily_goals
  add column if not exists effective_date date
    generated always as ((effective_from at time zone 'utc')::date) stored;

-- 3. Unique index on (user_id, effective_date). Postgres uses this
--    as the conflict target for ON CONFLICT (user_id, effective_date).
create unique index if not exists daily_goals_user_date_uniq
  on public.daily_goals (user_id, effective_date);
