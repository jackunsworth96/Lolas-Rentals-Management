ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS device_type text CHECK (device_type IN ('mobile', 'desktop'));
