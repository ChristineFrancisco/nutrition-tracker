-- Goal coach (M9). Three new columns on profiles drive the
-- personalized calorie + protein math:
--
--   goal_kind          'lose' | 'maintain' | 'gain'
--   weekly_change_kg   signed numeric, applied as a calorie delta
--                      against TDEE (1 kg of body fat ≈ 7700 kcal,
--                      so weekly_change_kg × 1100 ≈ daily delta)
--   composition_focus  'preserve' | 'recomp' | 'build' — scales the
--                      protein target. preserve=1.6 g/kg, recomp and
--                      build both 2.0 g/kg.
--
-- All three default to a maintenance baseline so existing rows
-- continue to compute the same goals they did pre-coach. The check
-- constraints clamp the velocity to a clinically defensible range
-- (you can't enter "lose 5 lbs/week" by mistake — the form would
-- need to allow it explicitly).

alter table public.profiles
  add column if not exists goal_kind text
    check (goal_kind in ('lose', 'maintain', 'gain'))
    not null default 'maintain';

alter table public.profiles
  add column if not exists weekly_change_kg numeric
    check (weekly_change_kg >= -1.0 and weekly_change_kg <= 0.5)
    not null default 0;

alter table public.profiles
  add column if not exists composition_focus text
    check (composition_focus in ('preserve', 'recomp', 'build'))
    not null default 'preserve';
