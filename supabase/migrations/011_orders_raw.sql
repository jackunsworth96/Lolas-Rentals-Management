-- ============================================================
-- ORDERS RAW — stores raw webhook payloads from WordPress/WooCommerce
-- ============================================================
CREATE TABLE orders_raw (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source"   text NOT NULL CHECK ("source" IN ('lolas', 'bass')),
  payload    jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'unprocessed'
               CHECK (status IN ('unprocessed', 'processed', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_raw_status ON orders_raw (status);
CREATE INDEX idx_orders_raw_source ON orders_raw ("source");
CREATE INDEX idx_orders_raw_created ON orders_raw (created_at DESC);

ALTER TABLE orders_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_raw_insert ON orders_raw
  FOR INSERT WITH CHECK (true);

CREATE POLICY orders_raw_select ON orders_raw
  FOR SELECT USING (true);
