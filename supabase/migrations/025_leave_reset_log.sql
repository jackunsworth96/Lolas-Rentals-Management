-- Idempotent annual leave reset audit trail (one successful reset per store per calendar day in job TZ)
CREATE TABLE IF NOT EXISTS leave_reset_log (
  id                bigserial PRIMARY KEY,
  store_id          text NOT NULL REFERENCES stores(id),
  run_date          date NOT NULL,
  employees_reset   integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_reset_log_store ON leave_reset_log(store_id);

ALTER TABLE leave_reset_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_reset_log_select ON leave_reset_log FOR SELECT USING (true);
