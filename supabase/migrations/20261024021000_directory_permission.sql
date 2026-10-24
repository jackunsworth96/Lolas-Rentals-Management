-- Directory contacts were previously gated behind the unrelated
-- `can_view_accounts` (Finance) permission, which silently blocked any
-- staff without Finance access from seeing the directory (the page just
-- showed an empty "no contacts yet" state instead of an error).
--
-- Give Directory its own permission and grant it to every existing role
-- so nobody currently able to use the page loses access. Admins can later
-- revoke it per-role from Settings -> Roles -> Edit Permissions.

INSERT INTO role_permissions (role_id, permission)
SELECT id, 'can_view_directory' FROM roles
ON CONFLICT DO NOTHING;
