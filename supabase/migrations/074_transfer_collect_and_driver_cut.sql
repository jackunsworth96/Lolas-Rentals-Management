-- Add cash-collection tracking to transfers
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS collected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS collected_amount  numeric(12,2);

-- Add driver cut to transfer routes for settlement calculations
ALTER TABLE transfer_routes
  ADD COLUMN IF NOT EXISTS driver_cut  numeric(12,2) NOT NULL DEFAULT 0;
