-- ============================================================
-- 096: Add walk-in direct-booking columns to order_items
-- ============================================================
-- The activate_order_atomic RPC (migrations 067 / 079) inserts
-- these columns into order_items, but they were never added to
-- the table itself, causing a runtime error:
--   "column vehicle_model_id of relation order_items does not exist"
--
-- All columns are nullable so existing WooCommerce-sourced rows
-- (which use the original schema: rental_rate, rental_days_count,
-- pickup_location, dropoff_location) remain unaffected.
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS vehicle_model_id   text REFERENCES public.vehicle_models (id),
  ADD COLUMN IF NOT EXISTS daily_rate         numeric(12,2),
  ADD COLUMN IF NOT EXISTS rental_days        integer,
  ADD COLUMN IF NOT EXISTS subtotal           numeric(12,2),
  ADD COLUMN IF NOT EXISTS pickup_location_id text,
  ADD COLUMN IF NOT EXISTS dropoff_location_id text,
  ADD COLUMN IF NOT EXISTS order_reference    text;
