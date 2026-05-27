-- ============================================================
-- 143: Add logo_display_height to accommodation_partners
-- Optional integer (pixels) that overrides the default max-height
-- used when rendering the partner logo on the guest booking pages
-- and the nav co-brand. Null = use the built-in defaults.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS logo_display_height integer;
