ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS customer_company TEXT,
  ADD COLUMN IF NOT EXISTS customer_extra_comments TEXT;
