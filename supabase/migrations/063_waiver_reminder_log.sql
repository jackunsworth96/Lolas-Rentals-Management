CREATE TABLE waiver_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id),
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX waiver_reminder_log_order_id_idx
  ON waiver_reminder_log(order_id);

CREATE INDEX waiver_reminder_log_sent_at_idx
  ON waiver_reminder_log(sent_at);

ALTER TABLE waiver_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY waiver_reminder_log_staff
  ON waiver_reminder_log
  FOR ALL
  USING (true);
