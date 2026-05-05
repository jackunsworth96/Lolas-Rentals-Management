-- ============================================================
-- 139: Early-bird discount tier on accommodation_partners
-- Adds a second, higher-value discount tier that applies when
-- a guest books at least `early_bird_days` days in advance.
-- Uses the same discount_type as the standard tier — just a
-- bigger value.  Null on both columns = no early-bird tier.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS early_bird_days integer,
  ADD COLUMN IF NOT EXISTS early_bird_discount_value numeric(10,2);
