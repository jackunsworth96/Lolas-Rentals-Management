-- ============================================================
-- Staff portal: leave requests, cash advance requests and payslip sign-off.
-- All access goes through the API (service role); RLS is on with no policies.
-- ============================================================

INSERT INTO day_types (id, name) VALUES ('unpaid_leave', 'Unpaid Leave')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL REFERENCES employees(id),
  store_id     text NOT NULL,
  leave_type   text NOT NULL CHECK (leave_type IN ('holiday', 'sick', 'unpaid')),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  days         integer NOT NULL CHECK (days > 0),
  reason       text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  text,
  reviewed_at  timestamptz,
  review_note  text,
  timesheet_ids text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_requests_employee_idx ON leave_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS leave_requests_pending_idx ON leave_requests (status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS advance_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL REFERENCES employees(id),
  store_id     text NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  reason       text,
  payday_type  text NOT NULL DEFAULT 'mid_month' CHECK (payday_type IN ('mid_month', 'end_of_month')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  text,
  reviewed_at  timestamptz,
  review_note  text,
  expense_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advance_requests_employee_idx ON advance_requests (employee_id, created_at);
CREATE INDEX IF NOT EXISTS advance_requests_pending_idx ON advance_requests (status) WHERE status = 'pending';

-- One sign-off per payslip. net_pay is snapshotted so the record shows what was acknowledged.
CREATE TABLE IF NOT EXISTS payslip_acknowledgements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id     uuid NOT NULL UNIQUE REFERENCES payslips(id) ON DELETE CASCADE,
  employee_id    text NOT NULL REFERENCES employees(id),
  status         text NOT NULL CHECK (status IN ('confirmed', 'disputed')),
  net_pay        numeric(12,2) NOT NULL,
  signed_name    text NOT NULL,
  signature_png  text,
  comment        text,
  ip_address     text,
  user_agent     text,
  signed_at      timestamptz NOT NULL DEFAULT now(),
  resolved_by    text,
  resolved_at    timestamptz,
  resolution_note text
);
CREATE INDEX IF NOT EXISTS payslip_ack_employee_idx ON payslip_acknowledgements (employee_id);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS reject_archived_store_write_leave_requests ON leave_requests;
CREATE TRIGGER reject_archived_store_write_leave_requests
  BEFORE INSERT OR UPDATE OR DELETE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION reject_archived_store_write();

DROP TRIGGER IF EXISTS reject_archived_store_write_advance_requests ON advance_requests;
CREATE TRIGGER reject_archived_store_write_advance_requests
  BEFORE INSERT OR UPDATE OR DELETE ON advance_requests
  FOR EACH ROW EXECUTE FUNCTION reject_archived_store_write();

INSERT INTO role_permissions (role_id, permission)
SELECT 'role-admin', 'can_approve_staff_requests'
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions WHERE role_id = 'role-admin' AND permission = 'can_approve_staff_requests'
);
