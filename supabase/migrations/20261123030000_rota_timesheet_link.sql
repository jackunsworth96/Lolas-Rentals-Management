-- ============================================================
-- Link the rota and timesheets.
--  * rota_assignments.actual_*: hours actually worked, entered on the rota
--    and only written to timesheets when the manager sends the week.
--  * timesheets.acknowledged_*: who confirmed a row that didn't match the rota.
--  * timesheet_deletions: deleted Pending rows. A separate table because
--    timesheet_amendment_logs cascades away with the timesheet.
-- API-only (service role); RLS on with no policies.
-- ============================================================

ALTER TABLE rota_assignments
  ADD COLUMN IF NOT EXISTS actual_start   time,
  ADD COLUMN IF NOT EXISTS actual_end     time,
  ADD COLUMN IF NOT EXISTS actual_nine_pm smallint CHECK (actual_nine_pm IS NULL OR actual_nine_pm >= 0),
  ADD COLUMN IF NOT EXISTS actual_note    text,
  ADD COLUMN IF NOT EXISTS actual_by      text,
  ADD COLUMN IF NOT EXISTS actual_at      timestamptz;

ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS acknowledged_by text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

CREATE TABLE IF NOT EXISTS timesheet_deletions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id  text NOT NULL,
  employee_id   text NOT NULL,
  date          date NOT NULL,
  store_id      text,
  deleted_by    text NOT NULL,
  deleted_at    timestamptz NOT NULL DEFAULT now(),
  reason        text NOT NULL,
  row_snapshot  jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS timesheet_deletions_employee_idx ON timesheet_deletions (employee_id, date);

ALTER TABLE timesheet_deletions ENABLE ROW LEVEL SECURITY;
