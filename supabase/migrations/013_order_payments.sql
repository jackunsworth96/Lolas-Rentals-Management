CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_order_id uuid REFERENCES orders_raw(id),
  order_id uuid REFERENCES orders(id),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method_id text NOT NULL,
  note text DEFAULT '',
  collected_by text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_payments_raw ON order_payments(raw_order_id);
CREATE INDEX idx_order_payments_order ON order_payments(order_id);
