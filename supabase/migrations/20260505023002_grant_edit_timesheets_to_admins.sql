-- ============================================================
-- Grant can_edit_timesheets to every role that already has
-- can_approve_timesheets (i.e. admin-level roles).
-- Jack and Nitz should both be on such a role.
-- Adjust the WHERE clause if a more targeted role is preferred.
-- ============================================================

INSERT INTO role_permissions (role_id, permission)
SELECT DISTINCT rp.role_id, 'can_edit_timesheets'
FROM role_permissions rp
WHERE rp.permission = 'can_approve_timesheets'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp2
    WHERE rp2.role_id = rp.role_id
      AND rp2.permission = 'can_edit_timesheets'
  )
ON CONFLICT DO NOTHING;
