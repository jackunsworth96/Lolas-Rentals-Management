-- ============================================================
-- MIGRATION 056: CancelOrders permission
-- Grants can_cancel_orders to role-admin and store-manager.
-- No schema changes — inserts only.
-- ============================================================

INSERT INTO role_permissions (role_id, permission)
VALUES
  ('role-admin',     'can_cancel_orders'),
  ('store-manager',  'can_cancel_orders')
ON CONFLICT DO NOTHING;
