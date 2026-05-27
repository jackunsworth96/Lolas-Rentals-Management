-- ============================================================
-- MIGRATION 056: CancelOrders permission
-- Grants can_cancel_orders to role-admin and store-manager.
-- No schema changes — inserts only.
-- ============================================================

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, 'can_cancel_orders'
FROM roles r
WHERE r.id IN ('role-admin', 'store-manager')
ON CONFLICT DO NOTHING;
