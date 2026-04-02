ALTER TABLE transfer_routes
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'fixed'
  CHECK (pricing_type IN ('fixed', 'per_head'));
