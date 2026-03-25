ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS default_float_amount numeric(12,2) NOT NULL DEFAULT 3000;
