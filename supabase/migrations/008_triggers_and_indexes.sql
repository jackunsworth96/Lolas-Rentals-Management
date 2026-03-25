-- ============================================================
-- TRIGGERS (updated_at auto-update)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t
    );
  END LOOP;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_orders_store_status    ON orders (store_id, status);
CREATE INDEX idx_orders_customer        ON orders (customer_id);
CREATE INDEX idx_orders_date            ON orders (order_date);
CREATE INDEX idx_order_items_order      ON order_items (order_id);
CREATE INDEX idx_order_items_vehicle    ON order_items (vehicle_id);
CREATE INDEX idx_order_addons_order     ON order_addons (order_id);
CREATE INDEX idx_payments_order         ON payments (order_id);
CREATE INDEX idx_payments_date          ON payments (transaction_date);
CREATE INDEX idx_fleet_store_status     ON fleet (store_id, status);
CREATE INDEX idx_je_transaction         ON journal_entries (transaction_id);
CREATE INDEX idx_je_account_date        ON journal_entries (account_id, date);
CREATE INDEX idx_je_store_date          ON journal_entries (store_id, date);
CREATE INDEX idx_je_reference           ON journal_entries (reference_type, reference_id);
CREATE INDEX idx_timesheets_emp_date    ON timesheets (employee_id, date);
CREATE INDEX idx_timesheets_store       ON timesheets (store_id, payroll_status);
CREATE INDEX idx_expenses_store_date    ON expenses (store_id, date);
CREATE INDEX idx_maintenance_asset      ON maintenance (asset_id);
CREATE INDEX idx_maintenance_store      ON maintenance (store_id, status);
CREATE INDEX idx_transfers_store_date   ON transfers (store_id, service_date);
CREATE INDEX idx_card_settle_store      ON card_settlements (store_id, is_paid);
CREATE INDEX idx_todo_assigned          ON todo_tasks (assigned_to, status);
CREATE INDEX idx_todo_comments_task     ON todo_comments (task_id);
CREATE INDEX idx_paw_card_email         ON paw_card_entries (email);
CREATE INDEX idx_vehicle_swaps_order    ON vehicle_swaps (order_id);
CREATE INDEX idx_cash_adv_employee      ON cash_advance_schedules (employee_id);
