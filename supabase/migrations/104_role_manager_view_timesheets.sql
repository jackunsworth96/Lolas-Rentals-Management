-- Grant can_view_timesheets to every role that can edit expenses but currently
-- cannot view the employee list. This is required for the Employee dropdown on
-- the Expenses page. Roles that already have the permission are left unchanged.
INSERT INTO role_permissions (role_id, permission)
SELECT DISTINCT rp.role_id, 'can_view_timesheets'
FROM role_permissions rp
WHERE rp.permission = 'can_edit_expenses'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions rp2
    WHERE rp2.role_id = rp.role_id
      AND rp2.permission = 'can_view_timesheets'
  )
ON CONFLICT DO NOTHING;
