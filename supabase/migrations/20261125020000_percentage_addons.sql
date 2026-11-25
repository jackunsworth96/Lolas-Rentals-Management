-- Percentage-of-rental add-ons (e.g. Cancellation Cover).
-- Line total = max(rental fee * price_percentage / 100, minimum_amount).
-- On order_addons rows of this type, addon_price holds the percentage and total_amount the computed charge.

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS price_percentage numeric(5,2) NOT NULL DEFAULT 0
    CHECK (price_percentage >= 0 AND price_percentage <= 100),
  ADD COLUMN IF NOT EXISTS minimum_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (minimum_amount >= 0);

ALTER TABLE addons DROP CONSTRAINT IF EXISTS addons_addon_type_check;
ALTER TABLE addons
  ADD CONSTRAINT addons_addon_type_check
  CHECK (addon_type IN ('per_day', 'one_time', 'percentage'));

ALTER TABLE order_addons DROP CONSTRAINT IF EXISTS order_addons_addon_type_check;
ALTER TABLE order_addons
  ADD CONSTRAINT order_addons_addon_type_check
  CHECK (addon_type IN ('per_day', 'one_time', 'percentage'));
