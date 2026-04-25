ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS pickup_location_address TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_location_address TEXT;
