ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS web_payment_method text;
