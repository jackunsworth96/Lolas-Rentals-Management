-- ============================================================
-- 145: Add referral_source to waivers
--
-- Captures how the customer heard about Lola's Rentals,
-- collected as a required field on the public waiver page.
-- Stored as free text (constrained by the application layer
-- to a known set of values) so options can evolve without
-- requiring future migrations.
-- ============================================================

ALTER TABLE public.waivers
  ADD COLUMN IF NOT EXISTS referral_source text;
