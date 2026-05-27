-- ============================================================
-- 140: Add welcome_message to accommodation_partners
-- Optional custom text shown on the booking page welcome card
-- when a guest arrives via a ?ref= affiliate link.
-- Falls back to the default copy when null.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS welcome_message text;
