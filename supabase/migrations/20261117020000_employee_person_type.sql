-- ============================================================
-- Person type on employees: owners and developers need a login
-- (and an identity for "who did this" attribution) but are not
-- staff. Staff-only features (payroll, rota grid, timesheets,
-- leave, cashup pickers, HR list) filter on person_type = 'staff'.
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS person_type text NOT NULL DEFAULT 'staff';

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_person_type_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_person_type_check CHECK (person_type IN ('staff', 'owner', 'developer'));

-- Jack: owner, not on payroll. Stays a rota approver (rota_settings.approver_ids untouched).
UPDATE employees
SET person_type = 'owner', basic_rate = 0, rate_type = NULL, updated_at = now()
WHERE id = 'b0f6292e-82b9-4570-b036-4a5f13da258a';

-- Developer role: read access across the back office plus settings.
-- No payroll, cash, accounting or approval rights. Tune in Settings → Roles.
INSERT INTO roles (id, name)
VALUES ('role-developer', 'Developer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
SELECT 'role-developer', p
FROM unnest(ARRAY[
  'can_view_inbox',
  'can_view_active',
  'can_view_completed',
  'can_view_fleet',
  'can_view_maintenance',
  'can_view_transfers',
  'can_view_expenses',
  'can_view_timesheets',
  'can_view_todo',
  'can_view_lostopportunity',
  'can_view_cashup',
  'can_view_uierrors',
  'can_view_miscsales',
  'can_view_directory',
  'can_view_dashboard',
  'can_edit_settings'
]) AS p
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp WHERE rp.role_id = 'role-developer' AND rp.permission = p
);
