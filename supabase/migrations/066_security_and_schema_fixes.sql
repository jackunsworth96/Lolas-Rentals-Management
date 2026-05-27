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

-- A5: Drop obsolete activate_order_atomic overload
-- orders.woo_order_id is text since migration 014, but the original
-- 049 declared p_woo_order_id as integer. Later migrations recreate
-- the current text-signature function; this historical migration only
-- needs to remove the stale integer overload during fresh replay.
DO $$
BEGIN
  EXECUTE '
    DROP FUNCTION IF EXISTS public.activate_order_atomic(
      text, text, integer, text, text, date, text, text, integer,
      numeric, numeric, text, numeric, numeric, numeric, numeric,
      text, text, text, numeric, numeric, timestamptz,
      jsonb, jsonb, jsonb, text, text, date, text, jsonb
    )
  ';
END $$;


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
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cancel_order_raw_atomic FROM authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_extend_raw_atomic FROM authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.confirm_extend_order_atomic FROM authenticated';

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.cancel_order_raw_atomic TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_extend_raw_atomic TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.confirm_extend_order_atomic TO service_role';
END $$;


-- ============================================================
-- SECTION D: Add missing composite index on orders_raw
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_raw_source_status_created
  ON public.orders_raw (source, status, created_at DESC);
