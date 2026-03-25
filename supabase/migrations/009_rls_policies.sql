-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================
-- Enable RLS on all tables. Store-scoped tables filter by
-- store_ids claim in the JWT. Write policies additionally
-- check permission claims. Paw Card endpoints bypass RLS
-- via the service role key.
-- ============================================================

-- Helper: extract store_ids array from JWT
CREATE OR REPLACE FUNCTION public.user_store_ids()
RETURNS text[] AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text((current_setting('request.jwt.claims', true)::jsonb) -> 'store_ids')),
    '{}'::text[]
  );
$$ LANGUAGE sql STABLE;

-- Helper: check if JWT has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(required text)
RETURNS boolean AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'permissions') ? required,
    false
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- STORES (everyone can read, admin can write)
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY stores_select ON stores FOR SELECT USING (true);
CREATE POLICY stores_modify ON stores FOR ALL USING (public.has_permission('can_edit_accounts'));

-- ============================================================
-- EMPLOYEES (store-scoped read, admin write)
-- ============================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_select ON employees FOR SELECT USING (store_id = ANY(public.user_store_ids()) OR store_id IS NULL);
CREATE POLICY employees_modify ON employees FOR ALL USING (public.has_permission('can_approve_timesheets'));

-- ============================================================
-- USERS (admin only)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_all ON users FOR ALL USING (public.has_permission('can_edit_accounts'));

-- ============================================================
-- ORDERS (store-scoped)
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select ON orders FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY orders_modify ON orders FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_select ON order_items FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY order_items_modify ON order_items FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

ALTER TABLE order_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_addons_select ON order_addons FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY order_addons_modify ON order_addons FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON payments FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY payments_modify ON payments FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

ALTER TABLE vehicle_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicle_swaps_select ON vehicle_swaps FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY vehicle_swaps_modify ON vehicle_swaps FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

-- ============================================================
-- CUSTOMERS (store-scoped)
-- ============================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON customers FOR SELECT USING (store_id = ANY(public.user_store_ids()) OR store_id IS NULL);
CREATE POLICY customers_modify ON customers FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_orders'));

-- ============================================================
-- FLEET (store-scoped)
-- ============================================================
ALTER TABLE fleet ENABLE ROW LEVEL SECURITY;
CREATE POLICY fleet_select ON fleet FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY fleet_modify ON fleet FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_fleet'));

-- ============================================================
-- ACCOUNTING (store-scoped)
-- ============================================================
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY je_select ON journal_entries FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY je_modify ON journal_entries FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_edit_accounts'));

ALTER TABLE cash_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY cashrecon_select ON cash_reconciliation FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY cashrecon_modify ON cash_reconciliation FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_cashup'));

ALTER TABLE card_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY cardsettl_select ON card_settlements FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY cardsettl_modify ON card_settlements FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_cardsettlements'));

-- ============================================================
-- HR & PAYROLL (store-scoped)
-- ============================================================
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ts_select ON timesheets FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY ts_modify ON timesheets FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_submit_timesheets'));

-- ============================================================
-- OPERATIONS (store-scoped)
-- ============================================================
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY maint_select ON maintenance FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY maint_modify ON maintenance FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_maintenance'));

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY exp_select ON expenses FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY exp_modify ON expenses FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_expenses'));

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY xfer_select ON transfers FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY xfer_modify ON transfers FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_transfers'));

ALTER TABLE misc_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY misc_select ON misc_sales FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY misc_modify ON misc_sales FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_miscsales'));

ALTER TABLE lost_opportunity ENABLE ROW LEVEL SECURITY;
CREATE POLICY lost_select ON lost_opportunity FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY lost_modify ON lost_opportunity FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_lostopportunity'));

-- ============================================================
-- TODO (store-scoped)
-- ============================================================
ALTER TABLE todo_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_select ON todo_tasks FOR SELECT USING (store_id = ANY(public.user_store_ids()));
CREATE POLICY todo_modify ON todo_tasks FOR ALL USING (store_id = ANY(public.user_store_ids()) AND public.has_permission('can_view_todo'));

ALTER TABLE todo_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY todocomm_select ON todo_comments FOR SELECT USING (true);
CREATE POLICY todocomm_insert ON todo_comments FOR INSERT WITH CHECK (public.has_permission('can_view_todo'));

-- ============================================================
-- CONFIG TABLES (read for all authenticated, write for admin)
-- ============================================================
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY coa_select ON chart_of_accounts FOR SELECT USING (true);
CREATE POLICY coa_modify ON chart_of_accounts FOR ALL USING (public.has_permission('can_edit_accounts'));

ALTER TABLE addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY addons_select ON addons FOR SELECT USING (true);
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY locations_select ON locations FOR SELECT USING (true);
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_select ON payment_methods FOR SELECT USING (true);
ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY vm_select ON vehicle_models FOR SELECT USING (true);
ALTER TABLE vehicle_model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY vmp_select ON vehicle_model_pricing FOR SELECT USING (true);
ALTER TABLE fleet_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fs_select ON fleet_statuses FOR SELECT USING (true);
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_select ON expense_categories FOR SELECT USING (true);
ALTER TABLE transfer_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tr_select ON transfer_routes FOR SELECT USING (true);
ALTER TABLE day_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY dt_select ON day_types FOR SELECT USING (true);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_select ON roles FOR SELECT USING (true);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rp_select ON role_permissions FOR SELECT USING (true);

-- ============================================================
-- PAW CARD (public read/write via service role -- no RLS restrictions)
-- ============================================================
ALTER TABLE paw_card_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pawcard_all ON paw_card_entries FOR ALL USING (true);
ALTER TABLE paw_card_establishments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pawcard_est_all ON paw_card_establishments FOR ALL USING (true);

-- ============================================================
-- UI ERRORS (all authenticated)
-- ============================================================
ALTER TABLE ui_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY uierrors_select ON ui_errors FOR SELECT USING (true);
CREATE POLICY uierrors_insert ON ui_errors FOR INSERT WITH CHECK (public.has_permission('can_view_uierrors'));

-- ============================================================
-- NEW FUNCTIONALITY
-- ============================================================
ALTER TABLE merchandise ENABLE ROW LEVEL SECURITY;
CREATE POLICY merch_all ON merchandise FOR ALL USING (true);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviews_all ON reviews FOR ALL USING (true);
ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY bills_select ON recurring_bills FOR SELECT USING (true);
CREATE POLICY bills_modify ON recurring_bills FOR ALL USING (public.has_permission('can_edit_accounts'));
ALTER TABLE directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY dir_all ON directory FOR ALL USING (true);
ALTER TABLE leave_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY lc_select ON leave_config FOR SELECT USING (true);
CREATE POLICY lc_modify ON leave_config FOR ALL USING (public.has_permission('can_edit_accounts'));
ALTER TABLE maintenance_work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY mwt_select ON maintenance_work_types FOR SELECT USING (true);
ALTER TABLE cash_advance_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY cas_select ON cash_advance_schedules FOR SELECT USING (true);
