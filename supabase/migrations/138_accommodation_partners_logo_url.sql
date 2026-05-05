-- ============================================================
-- 138: Add logo_url to accommodation_partners
-- Stores a Cloudinary (or any CDN) URL for the partner's logo.
-- Displayed on the booking page welcome card when a guest
-- arrives via a ?ref= affiliate link.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS logo_url text;
