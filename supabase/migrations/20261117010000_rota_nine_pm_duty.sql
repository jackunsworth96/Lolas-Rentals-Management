-- ============================================================
-- Rota duties: who handles the 9pm returns on a given day.
-- API-only (service role); RLS on with no policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS rota_duties (
  store_id     text NOT NULL REFERENCES stores(id),
  date         date NOT NULL,
  duty         text NOT NULL CHECK (duty IN ('nine_pm_return')),
  employee_id  text NOT NULL REFERENCES employees(id),
  assigned_by  text NOT NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date, duty)
);
CREATE INDEX IF NOT EXISTS rota_duties_employee_idx ON rota_duties (employee_id, date);

ALTER TABLE rota_duties ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS reject_archived_store_write_rota_duties ON rota_duties;
CREATE TRIGGER reject_archived_store_write_rota_duties
  BEFORE INSERT OR UPDATE OR DELETE ON rota_duties
  FOR EACH ROW EXECUTE FUNCTION reject_archived_store_write();
