-- ============================================================
-- 142: Add logo_display_width to accommodation_partners
-- Optional integer (pixels) that overrides the default max-width
-- used when rendering the partner logo on the guest booking pages
-- and the nav co-brand. Null = use the built-in defaults.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS logo_display_width integer;
