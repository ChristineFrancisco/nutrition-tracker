-- 0006: Expand the nutrient schema on daily_goals.
--
-- Adds 11 new fields to bring the tracked set from 21 → 32, matching the
-- expanded Nutrients type in src/lib/targets/types.ts. These are nutrients
-- that are reasonable for the vision model to estimate from ingredients
-- and that show up either on FDA labels or in the Health Canada / IOM DRI
-- tables.
--
-- entries.nutrients is a jsonb blob and doesn't need a schema change —
-- historical entries simply won't have the new keys until re-analyzed.
--
-- New columns:
--   cholesterol_mg   (ceiling, FDA DV 300 mg)
--   zinc_mg, phosphorus_mg, copper_mg, selenium_mcg, manganese_mg
--   thiamin_mg (B1), riboflavin_mg (B2), niacin_mg (B3), b6_mg, choline_mg

alter table public.daily_goals
  add column if not exists cholesterol_mg numeric,
  add column if not exists zinc_mg numeric,
  add column if not exists phosphorus_mg numeric,
  add column if not exists copper_mg numeric,
  add column if not exists selenium_mcg numeric,
  add column if not exists manganese_mg numeric,
  add column if not exists thiamin_mg numeric,
  add column if not exists riboflavin_mg numeric,
  add column if not exists niacin_mg numeric,
  add column if not exists b6_mg numeric,
  add column if not exists choline_mg numeric;
