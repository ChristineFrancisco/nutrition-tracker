-- Per-user IANA timezone string. Drives day/month/range boundary
-- math so "today" matches the user's wall clock instead of the
-- server's (which is UTC on Vercel).
--
-- Nullable: legacy rows stay null and the app falls back to UTC for
-- those, then captures the browser tz on the user's next page load
-- and writes here. Once written, this is the source of truth.
--
-- Examples: "America/Los_Angeles", "Europe/London", "Asia/Tokyo".
-- The string is whatever Intl.DateTimeFormat().resolvedOptions()
-- .timeZone returns in the browser; Postgres doesn't validate it,
-- but the server-side helpers do (Intl throws on invalid values).

alter table public.profiles
  add column if not exists timezone text;
