-- ============================================================
-- 149: Add referral_detail to waivers
--
-- Optional free-text field to capture specifics when a customer
-- selects "My hotel or accommodation" as their referral source.
-- Populated by the application layer only for relevant source
-- values; null for all other referral sources.
-- ============================================================

ALTER TABLE public.waivers
  ADD COLUMN IF NOT EXISTS referral_detail text;
