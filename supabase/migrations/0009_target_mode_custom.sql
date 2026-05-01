-- Allow 'custom' as a third target_mode alongside 'generic' and
-- 'personalized'. With this in place:
--
--   generic       → FDA Daily Values, no profile required
--   personalized  → DRI minimums computed from sex+age+(height/weight/
--                   activity); ignores goal-coach fields
--   custom        → DRI base + goal coach: applies weekly_change_kg
--                   delta against TDEE and scales protein by
--                   composition_focus
--
-- The constraint name in 0001 was the implicit `profiles_target_mode_check`
-- so we drop and re-add. Existing rows are unaffected — 'generic' and
-- 'personalized' remain valid.

alter table public.profiles
  drop constraint if exists profiles_target_mode_check;

alter table public.profiles
  add constraint profiles_target_mode_check
    check (target_mode in ('generic', 'personalized', 'custom'));
