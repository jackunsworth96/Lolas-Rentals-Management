-- ============================================================
-- Fix accommodation_aliases upsert ON CONFLICT target
--
-- Migration 150 created a unique index on the *expression*
-- lower(trim(raw_name)) rather than on the raw_name column itself.
-- Postgres' ON CONFLICT clause (used by the
-- POST /dashboard/accommodation-aliases upsert) requires a unique
-- constraint/index on the exact column list it names, so
-- `.upsert({...}, { onConflict: 'raw_name' })` fails every time with:
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- This surfaced to staff as "An unexpected error occurred" whenever
-- they tried to save an alias on the dashboard.
--
-- raw_name is always normalised (lower-cased, trimmed, whitespace
-- collapsed) by the API before insert, so a plain unique constraint
-- on the column gives the same de-duplication guarantee and also
-- works as a valid ON CONFLICT target.
-- ============================================================

ALTER TABLE public.accommodation_aliases
  ADD CONSTRAINT accommodation_aliases_raw_name_key UNIQUE (raw_name);

DROP INDEX IF EXISTS public.accommodation_aliases_raw_name_idx;
