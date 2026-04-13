-- ============================================================
-- 066: Security hardening and schema consistency fixes
-- Safe, idempotent. Does NOT modify any existing migration file.
-- ============================================================

-- ============================================================
-- SECTION A: Fix schema inconsistencies that cause
--            supabase db reset to fail
-- ============================================================

-- A1: Add missing columns to orders_raw
-- (referenced by cancel_order_raw_atomic RPC in 055)
ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

-- A2: Fix the status CHECK constraint on orders_raw to include 'cancelled'
ALTER TABLE public.orders_raw DROP CONSTRAINT IF EXISTS orders_raw_status_check;
ALTER TABLE public.orders_raw ADD CONSTRAINT orders_raw_status_check
  CHECK (status IN ('unprocessed', 'processed', 'skipped', 'cancelled'));

-- A3: Add missing order_reference column to booking_holds
-- (referenced by 055 cancel RPC line 50)
ALTER TABLE public.booking_holds
  ADD COLUMN IF NOT EXISTS order_reference text;

-- A4: Fix match_card_settlement RPC
-- card_settlements.id is text since migration 018, but the
-- original 046 declared p_settlement_ids as integer[].
-- Recreate with text[] and add SECURITY DEFINER + search_path.
-- Body is identical to 046 except for the parameter type.
DROP FUNCTION IF EXISTS public.match_card_settlement(
  text, text, date, text, jsonb, integer[],
  boolean, date, text, numeric, numeric, text, text[], text
);

CREATE OR REPLACE FUNCTION public.match_card_settlement(
  p_transaction_id    text,
  p_period            text,
  p_date              date,
  p_store_id          text,
  p_legs              jsonb,
  p_settlement_ids    text[],
  p_is_paid           boolean,
  p_date_settled      date,
  p_settlement_ref    text,
  p_net_amount        numeric(12,2),
  p_fee_expense       numeric(12,2),
  p_account_id        text,
  p_payment_ids       text[],
  p_settlement_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description,
    reference_type, reference_id, created_by
  )
  SELECT
    leg->>'id',
    p_transaction_id,
    p_period,
    p_date,
    p_store_id,
    leg->>'account_id',
    (leg->>'debit')::numeric(12,2),
    (leg->>'credit')::numeric(12,2),
    leg->>'description',
    leg->>'reference_type',
    leg->>'reference_id',
    NULL
  FROM jsonb_array_elements(p_legs) AS leg;

  UPDATE card_settlements
  SET
    is_paid        = p_is_paid,
    date_settled   = p_date_settled,
    settlement_ref = p_settlement_ref,
    net_amount     = p_net_amount,
    fee_expense    = p_fee_expense,
    account_id     = p_account_id
  WHERE id = ANY(p_settlement_ids);

  IF array_length(p_payment_ids, 1) > 0 THEN
    UPDATE payments
    SET settlement_status = p_settlement_status
    WHERE id = ANY(p_payment_ids);
  END IF;
END;
$$;

-- A5: Fix activate_order_atomic RPC
-- orders.woo_order_id is text since migration 014, but the
-- original 049 declared p_woo_order_id as integer.
-- Recreate with text. Also add SET search_path = public.
-- Body is identical to 049 except for the parameter type.
DROP FUNCTION IF EXISTS public.activate_order_atomic(
  text, text, integer, text, text, date, text, text, integer,
  numeric, numeric, text, numeric, numeric, numeric, numeric,
  text, text, text, numeric, numeric, timestamptz,
  jsonb, jsonb, jsonb, text, text, date, text, jsonb
);

CREATE OR REPLACE FUNCTION public.activate_order_atomic(
  p_order_id              text,
  p_store_id              text,
  p_woo_order_id          text,
  p_customer_id           text,
  p_employee_id           text,
  p_order_date            date,
  p_status                text,
  p_web_notes             text,
  p_quantity              integer,
  p_web_quote_raw         numeric(12,2),
  p_security_deposit      numeric(12,2),
  p_deposit_status        text,
  p_card_fee_surcharge    numeric(12,2),
  p_return_charges        numeric(12,2),
  p_final_total           numeric(12,2),
  p_balance_due           numeric(12,2),
  p_payment_method_id     text,
  p_deposit_method_id     text,
  p_booking_token         text,
  p_tips                  numeric(12,2),
  p_charity_donation      numeric(12,2),
  p_updated_at            timestamptz,
  p_order_items           jsonb,
  p_order_addons          jsonb,
  p_fleet_updates         jsonb,
  p_journal_transaction_id text,
  p_journal_period        text,
  p_journal_date          date,
  p_journal_store_id      text,
  p_journal_legs          jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  addon jsonb;
  vehicle jsonb;
  leg jsonb;
BEGIN
  -- 1. Upsert the order record
  INSERT INTO orders (
    id, store_id, woo_order_id, customer_id, employee_id,
    order_date, status, web_notes, quantity, web_quote_raw,
    security_deposit, deposit_status, card_fee_surcharge,
    return_charges, final_total, balance_due, payment_method_id,
    deposit_method_id, booking_token, tips, charity_donation, updated_at
  ) VALUES (
    p_order_id, p_store_id, p_woo_order_id, p_customer_id, p_employee_id,
    p_order_date, p_status, p_web_notes, p_quantity, p_web_quote_raw,
    p_security_deposit, p_deposit_status, p_card_fee_surcharge,
    p_return_charges, p_final_total, p_balance_due, p_payment_method_id,
    p_deposit_method_id, p_booking_token, p_tips, p_charity_donation,
    p_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id           = EXCLUDED.store_id,
    woo_order_id       = EXCLUDED.woo_order_id,
    customer_id        = EXCLUDED.customer_id,
    employee_id        = EXCLUDED.employee_id,
    order_date         = EXCLUDED.order_date,
    status             = EXCLUDED.status,
    web_notes          = EXCLUDED.web_notes,
    quantity           = EXCLUDED.quantity,
    web_quote_raw      = EXCLUDED.web_quote_raw,
    security_deposit   = EXCLUDED.security_deposit,
    deposit_status     = EXCLUDED.deposit_status,
    card_fee_surcharge = EXCLUDED.card_fee_surcharge,
    return_charges     = EXCLUDED.return_charges,
    final_total        = EXCLUDED.final_total,
    balance_due        = EXCLUDED.balance_due,
    payment_method_id  = EXCLUDED.payment_method_id,
    deposit_method_id  = EXCLUDED.deposit_method_id,
    booking_token      = EXCLUDED.booking_token,
    tips               = EXCLUDED.tips,
    charity_donation   = EXCLUDED.charity_donation,
    updated_at         = EXCLUDED.updated_at;

  -- 2. Upsert order items
  FOR item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    INSERT INTO order_items (
      id, store_id, order_id, vehicle_id, vehicle_name,
      pickup_datetime, dropoff_datetime, rental_days_count,
      pickup_location, dropoff_location, pickup_fee, dropoff_fee,
      rental_rate, helmet_numbers, discount, ops_notes, return_condition
    ) VALUES (
      item->>'id',
      item->>'store_id',
      item->>'order_id',
      item->>'vehicle_id',
      item->>'vehicle_name',
      (item->>'pickup_datetime')::timestamptz,
      (item->>'dropoff_datetime')::timestamptz,
      (item->>'rental_days_count')::integer,
      item->>'pickup_location',
      item->>'dropoff_location',
      (item->>'pickup_fee')::numeric(12,2),
      (item->>'dropoff_fee')::numeric(12,2),
      (item->>'rental_rate')::numeric(12,2),
      item->>'helmet_numbers',
      (item->>'discount')::numeric(12,2),
      item->>'ops_notes',
      item->>'return_condition'
    )
    ON CONFLICT (id) DO UPDATE SET
      store_id          = EXCLUDED.store_id,
      order_id          = EXCLUDED.order_id,
      vehicle_id        = EXCLUDED.vehicle_id,
      vehicle_name      = EXCLUDED.vehicle_name,
      pickup_datetime   = EXCLUDED.pickup_datetime,
      dropoff_datetime  = EXCLUDED.dropoff_datetime,
      rental_days_count = EXCLUDED.rental_days_count,
      pickup_location   = EXCLUDED.pickup_location,
      dropoff_location  = EXCLUDED.dropoff_location,
      pickup_fee        = EXCLUDED.pickup_fee,
      dropoff_fee       = EXCLUDED.dropoff_fee,
      rental_rate       = EXCLUDED.rental_rate,
      helmet_numbers    = EXCLUDED.helmet_numbers,
      discount          = EXCLUDED.discount,
      ops_notes         = EXCLUDED.ops_notes,
      return_condition  = EXCLUDED.return_condition;
  END LOOP;

  -- 3. Upsert order addons
  FOR addon IN SELECT * FROM jsonb_array_elements(p_order_addons)
  LOOP
    INSERT INTO order_addons (
      id, order_id, addon_name, addon_price,
      addon_type, quantity, total_amount, store_id
    ) VALUES (
      addon->>'id',
      addon->>'order_id',
      addon->>'addon_name',
      (addon->>'addon_price')::numeric(12,2),
      addon->>'addon_type',
      (addon->>'quantity')::integer,
      (addon->>'total_amount')::numeric(12,2),
      addon->>'store_id'
    )
    ON CONFLICT (id) DO UPDATE SET
      order_id    = EXCLUDED.order_id,
      addon_name  = EXCLUDED.addon_name,
      addon_price = EXCLUDED.addon_price,
      addon_type  = EXCLUDED.addon_type,
      quantity    = EXCLUDED.quantity,
      total_amount = EXCLUDED.total_amount,
      store_id    = EXCLUDED.store_id;
  END LOOP;

  -- 4. Update fleet vehicle statuses
  FOR vehicle IN SELECT * FROM jsonb_array_elements(p_fleet_updates)
  LOOP
    UPDATE fleet
    SET
      status     = vehicle->>'status',
      updated_at = (vehicle->>'updated_at')::timestamptz
    WHERE id = vehicle->>'id';
  END LOOP;

  -- 5. Insert journal entries (only if legs array is non-empty)
  IF jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs)
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        p_journal_transaction_id,
        p_journal_period,
        p_journal_date,
        p_journal_store_id,
        leg->>'account_id',
        (leg->>'debit')::numeric(12,2),
        (leg->>'credit')::numeric(12,2),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END IF;

END;
$$;


-- ============================================================
-- SECTION B: Fix open RLS policies on financial and
--            sensitive tables
-- ============================================================

-- B1: budget_periods — replace open policy with permission check
DROP POLICY IF EXISTS budget_periods_all ON public.budget_periods;

CREATE POLICY budget_periods_select ON public.budget_periods
  FOR SELECT USING (public.has_permission('can_view_accounts'));

CREATE POLICY budget_periods_modify ON public.budget_periods
  FOR ALL USING (public.has_permission('can_edit_settings'));

-- B2: budget_lines — same pattern
DROP POLICY IF EXISTS budget_lines_all ON public.budget_lines;

CREATE POLICY budget_lines_select ON public.budget_lines
  FOR SELECT USING (public.has_permission('can_view_accounts'));

CREATE POLICY budget_lines_modify ON public.budget_lines
  FOR ALL USING (public.has_permission('can_edit_settings'));

-- B3: orders_raw — restrict INSERT to service_role, SELECT to permission
DROP POLICY IF EXISTS orders_raw_insert ON public.orders_raw;
DROP POLICY IF EXISTS orders_raw_select ON public.orders_raw;

CREATE POLICY orders_raw_insert ON public.orders_raw
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY orders_raw_select ON public.orders_raw
  FOR SELECT USING (public.has_permission('can_view_accounts'));

-- B4: waivers — restrict SELECT to staff with permission
-- (public insert for customer signing is preserved)
DROP POLICY IF EXISTS waivers_public_read ON public.waivers;

CREATE POLICY waivers_staff_select ON public.waivers
  FOR SELECT USING (public.has_permission('can_view_accounts'));

-- B5: late_return_assignments — replace open policy with store-scoped
DROP POLICY IF EXISTS late_return_assignments_all ON public.late_return_assignments;

CREATE POLICY late_return_assignments_select ON public.late_return_assignments
  FOR SELECT USING (
    store_id = ANY(public.user_store_ids())
  );

CREATE POLICY late_return_assignments_modify ON public.late_return_assignments
  FOR ALL USING (
    store_id = ANY(public.user_store_ids())
  );

-- B6: booking_holds — fix policies for public booking flow
-- The customer flow uses anon role to create/release holds,
-- so INSERT and DELETE must remain open. SELECT is scoped so
-- staff only see their own stores, but anon can also read
-- (needed by hold polling in the booking UI).
DROP POLICY IF EXISTS booking_holds_select ON public.booking_holds;
DROP POLICY IF EXISTS booking_holds_insert ON public.booking_holds;
DROP POLICY IF EXISTS booking_holds_delete ON public.booking_holds;

CREATE POLICY booking_holds_insert ON public.booking_holds
  FOR INSERT WITH CHECK (true);

CREATE POLICY booking_holds_delete ON public.booking_holds
  FOR DELETE USING (true);

CREATE POLICY booking_holds_select ON public.booking_holds
  FOR SELECT USING (
    auth.role() = 'anon'
    OR store_id = ANY(public.user_store_ids())
  );


-- ============================================================
-- SECTION C: Secure SECURITY DEFINER RPCs
-- ============================================================

-- 058 already revoked from anon — now also revoke from authenticated.
-- Only service_role (the API server) should call these.
REVOKE EXECUTE ON FUNCTION public.cancel_order_raw_atomic FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_extend_raw_atomic FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_extend_order_atomic FROM authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_order_raw_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_extend_raw_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_extend_order_atomic TO service_role;


-- ============================================================
-- SECTION D: Add missing composite index on orders_raw
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_raw_source_status_created
  ON public.orders_raw (source, status, created_at DESC);
