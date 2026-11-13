-- ============================================================
-- Fixed salary pay basis and weekly work updates.
-- 'fixed' staff are paid half their monthly salary each payday regardless of
-- timesheets; only approved unpaid leave reduces it. They report outcomes
-- through weekly updates instead of shop timesheets.
-- ============================================================

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_rate_type_check;
ALTER TABLE employees ADD CONSTRAINT employees_rate_type_check
  CHECK (rate_type IN ('daily', 'monthly', 'fixed'));

-- George Rios Jr. (business development): fixed ₱26,000 a month.
UPDATE employees SET rate_type = 'fixed' WHERE id = '43ae55f6-fe46-46d3-8652-b1424dc03d52';
UPDATE employee_rate_history SET rate_type = 'fixed' WHERE employee_id = '43ae55f6-fe46-46d3-8652-b1424dc03d52';

CREATE TABLE IF NOT EXISTS work_updates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     text NOT NULL REFERENCES employees(id),
  store_id        text NOT NULL,
  week_start      date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  worked_on       text NOT NULL,
  results         text,
  next_week       text,
  blockers        text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  manager_comment text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  UNIQUE (employee_id, week_start)
);
CREATE INDEX IF NOT EXISTS work_updates_week_idx ON work_updates (week_start DESC);

ALTER TABLE work_updates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS reject_archived_store_write_work_updates ON work_updates;
CREATE TRIGGER reject_archived_store_write_work_updates
  BEFORE INSERT OR UPDATE OR DELETE ON work_updates
  FOR EACH ROW EXECUTE FUNCTION reject_archived_store_write();
