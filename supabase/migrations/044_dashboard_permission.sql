INSERT INTO role_permissions (role_id, permission)
SELECT id, 'can_view_dashboard'
FROM roles
WHERE id = 'role-admin'
ON CONFLICT DO NOTHING;
