-- Transfer add-on fields for direct bookings
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS transfer_type       text,
  ADD COLUMN IF NOT EXISTS flight_number       text,
  ADD COLUMN IF NOT EXISTS flight_arrival_time timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_route      text;
