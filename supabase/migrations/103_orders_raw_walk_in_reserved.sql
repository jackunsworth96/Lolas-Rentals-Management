-- ============================================================
-- 103: Support walk-in reservations in orders_raw
-- ============================================================
-- Two additions:
--   1. Extend the booking_channel check constraint to include
--      'walk_in' (the /walk-in and /walk-in-reserved endpoints
--      already write this value — the old constraint was too narrow).
--   2. Add vehicle_id so that a future "Reserve for Later" row
--      can hold a specific fleet unit, enabling exact-vehicle
--      availability blocking on the calendar and public website.
-- ============================================================

-- 1. Widen the booking_channel constraint ----------------------
ALTER TABLE orders_raw
  DROP CONSTRAINT IF EXISTS orders_raw_booking_channel_check;

ALTER TABLE orders_raw
  ADD CONSTRAINT orders_raw_booking_channel_check
  CHECK (booking_channel IN ('woocommerce', 'direct', 'walk_in'));

-- 2. Add vehicle_id column for specific-unit holds -------------
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS vehicle_id text REFERENCES fleet (id);

CREATE INDEX IF NOT EXISTS idx_orders_raw_vehicle_id
  ON orders_raw (vehicle_id)
  WHERE vehicle_id IS NOT NULL;
