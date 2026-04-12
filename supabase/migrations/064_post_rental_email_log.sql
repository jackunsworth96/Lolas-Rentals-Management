CREATE TABLE post_rental_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_rental_email_log_order_id_idx
  ON post_rental_email_log(order_id);

ALTER TABLE post_rental_email_log
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_rental_email_log_staff
  ON post_rental_email_log
  FOR ALL
  USING (true);
