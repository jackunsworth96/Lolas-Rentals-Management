-- Idempotent: fixes projects where 017 was never applied (Supabase rejects unknown columns on upsert).
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS default_float_amount numeric(12,2) NOT NULL DEFAULT 3000;
