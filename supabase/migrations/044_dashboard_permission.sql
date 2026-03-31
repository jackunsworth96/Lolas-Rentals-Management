INSERT INTO role_permissions (role_id, permission)
VALUES ('role-admin', 'can_view_dashboard')
ON CONFLICT DO NOTHING;
