-- ============================================================
-- ORDERS RAW — add booking channel + structured columns for direct bookings
-- ============================================================
-- The existing "source" column stores the brand/store ('lolas' | 'bass').
-- "booking_channel" tracks WHERE the booking originated: WooCommerce webhook
-- vs a direct booking created in the new customer-facing app.
-- All new columns are nullable so existing WooCommerce rows are unaffected.
-- ============================================================

-- 1. Booking channel -------------------------------------------
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS booking_channel text NOT NULL DEFAULT 'woocommerce';

ALTER TABLE orders_raw
  ADD CONSTRAINT orders_raw_booking_channel_check
  CHECK (booking_channel IN ('woocommerce', 'direct'));

-- 2. Structured booking columns --------------------------------
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS customer_name        text,
  ADD COLUMN IF NOT EXISTS customer_email       text,
  ADD COLUMN IF NOT EXISTS customer_mobile      text,
  ADD COLUMN IF NOT EXISTS vehicle_model_id     text,
  ADD COLUMN IF NOT EXISTS pickup_datetime      timestamptz,
  ADD COLUMN IF NOT EXISTS dropoff_datetime     timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_location_id   integer,
  ADD COLUMN IF NOT EXISTS dropoff_location_id  integer,
  ADD COLUMN IF NOT EXISTS store_id             text,
  ADD COLUMN IF NOT EXISTS order_reference      text,
  ADD COLUMN IF NOT EXISTS addon_ids            integer[];

-- 3. Make payload nullable for direct bookings -----------------
-- WooCommerce rows always have a payload; direct bookings use the
-- structured columns instead and may not carry a JSON blob.
ALTER TABLE orders_raw
  ALTER COLUMN payload DROP NOT NULL;

-- 4. Index on booking_channel for filtering --------------------
CREATE INDEX IF NOT EXISTS idx_orders_raw_booking_channel
  ON orders_raw (booking_channel);
