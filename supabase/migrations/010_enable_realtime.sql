-- ============================================================
-- ENABLE REALTIME ON KEY TABLES
-- ============================================================
-- Supabase Realtime broadcasts row-level changes over websockets.
-- Only enable on tables that need live UI updates.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE fleet;
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance;
ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE todo_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE todo_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_reconciliation;
ALTER PUBLICATION supabase_realtime ADD TABLE timesheets;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
