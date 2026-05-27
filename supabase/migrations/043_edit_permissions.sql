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
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (
  VALUES
    ('can_edit_expenses'),
    ('can_edit_maintenance'),
    ('can_edit_transfers')
) AS p(permission)
WHERE r.id = 'role-admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (
  VALUES
    ('can_edit_expenses'),
    ('can_edit_maintenance'),
    ('can_edit_transfers')
) AS p(permission)
WHERE r.id = 'role-manager'
ON CONFLICT DO NOTHING;
