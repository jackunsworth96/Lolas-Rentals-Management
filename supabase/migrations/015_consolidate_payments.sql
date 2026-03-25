-- Add raw_order_id to payments so pre-activation payments can reference
-- the raw order before a canonical order record exists.
ALTER TABLE payments
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS raw_order_id uuid REFERENCES orders_raw(id);

CREATE INDEX IF NOT EXISTS idx_payments_raw_order ON payments(raw_order_id)
  WHERE raw_order_id IS NOT NULL;

-- Drop the redundant order_payments table (migration 013).
-- Any data in order_payments is lost — this table was only used by
-- an inline route handler and was invisible to balance/accounting logic.
DROP TABLE IF EXISTS order_payments;
