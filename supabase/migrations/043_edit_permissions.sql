-- ============================================================
-- Grant edit permissions for expenses, maintenance, and
-- transfers to Admin and Manager roles.
--
-- Role ID source: apps/api/scripts/seed-users.ts
--   Admin   → 'role-admin'
--   Manager → 'role-manager'  (same role-{name} pattern)
--
-- Staff and other roles are intentionally excluded — edit
-- access for those roles must be granted manually via the
-- Settings page.
-- ============================================================

INSERT INTO role_permissions (role_id, permission)
VALUES
  ('role-admin', 'can_edit_expenses'),
  ('role-admin', 'can_edit_maintenance'),
  ('role-admin', 'can_edit_transfers')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
VALUES
  ('role-manager', 'can_edit_expenses'),
  ('role-manager', 'can_edit_maintenance'),
  ('role-manager', 'can_edit_transfers')
ON CONFLICT DO NOTHING;
