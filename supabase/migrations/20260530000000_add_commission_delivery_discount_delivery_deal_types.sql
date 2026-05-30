-- ============================================================
-- Expand deal_type to include two new combo types:
--   commission_delivery  — partner earns commission AND guests
--                          get free pickup/collection
--   discount_delivery    — guest gets a rental discount AND free
--                          pickup/collection
-- These complement the existing 'combined' type which bundles
-- all three benefits together.
-- ============================================================

-- The original inline CHECK was created as an anonymous constraint;
-- drop it by name (Postgres auto-names it <table>_<col>_check).
ALTER TABLE public.accommodation_partners
  DROP CONSTRAINT IF EXISTS accommodation_partners_deal_type_check;

ALTER TABLE public.accommodation_partners
  ADD CONSTRAINT accommodation_partners_deal_type_check
    CHECK (deal_type IN (
      'commission',
      'discount',
      'free_delivery',
      'combined',
      'commission_delivery',
      'discount_delivery'
    ));
