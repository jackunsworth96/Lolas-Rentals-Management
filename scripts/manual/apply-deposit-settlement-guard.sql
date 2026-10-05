-- Apply manually after a backup and read-only review. Do not add to the
-- Supabase migration history. Deploy the matching API in the same window.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('lolas_deposit_settlement_guard'));

DO $preflight$
BEGIN
  IF to_regprocedure('public.settle_order_atomic(text,text,timestamp with time zone,numeric,jsonb,jsonb,jsonb,text,text,date,jsonb,jsonb,numeric,numeric,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Deposit guard requires the 17-argument settle_order_atomic function';
  END IF;
  IF to_regclass('public.payments') IS NULL OR to_regclass('public.orders') IS NULL
    OR to_regclass('public.payment_methods') IS NULL
    OR to_regclass('public.chart_of_accounts') IS NULL
    OR to_regclass('public.journal_entries') IS NULL THEN
    RAISE EXCEPTION 'Deposit guard requires orders, payments, payment_methods, chart_of_accounts, and journal_entries';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_methods'
      AND column_name = 'gateway_provider'
  ) THEN
    RAISE EXCEPTION 'Deposit guard requires payment_methods.gateway_provider';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id
    WHERE o.status = 'active' AND p.payment_type IN ('deposit', 'security_deposit')
    GROUP BY o.id, o.security_deposit
    HAVING SUM(p.amount) > o.security_deposit
  ) THEN
    RAISE EXCEPTION 'Active orders contain deposits greater than their required amount; reconcile before installation';
  END IF;
END;
$preflight$;

-- Deposit receipts must serialize with settlement's order lock. A completed
-- order cannot acquire a new deposit receipt after its refund was calculated.
CREATE OR REPLACE FUNCTION public.guard_order_deposit_payment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
DECLARE
  v_order_id text;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payment_type IN ('deposit', 'security_deposit') AND OLD.order_id IS NOT NULL THEN
      RAISE EXCEPTION 'Posted deposit receipts cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.payment_type IN ('deposit', 'security_deposit') THEN
      IF OLD.order_id IS NOT NULL AND (
        NEW.order_id IS DISTINCT FROM OLD.order_id OR
        NEW.amount IS DISTINCT FROM OLD.amount OR
        NEW.payment_type IS DISTINCT FROM OLD.payment_type
      ) THEN
        RAISE EXCEPTION 'Posted deposit amount and order cannot be changed';
      END IF;
      IF OLD.order_id IS NOT NULL THEN
        SELECT status INTO v_status FROM public.orders WHERE id = OLD.order_id FOR UPDATE;
        IF v_status IS DISTINCT FROM 'active' THEN
          RAISE EXCEPTION 'Deposit receipt for order % cannot change after activation period', OLD.order_id;
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.payment_type IN ('deposit', 'security_deposit') THEN
    v_order_id := NEW.order_id;
    IF v_order_id IS NOT NULL THEN
      SELECT status INTO v_status FROM public.orders WHERE id = v_order_id FOR UPDATE;
      IF v_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Deposit receipt requires an active order: %', v_order_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_order_deposit_payment_mutation ON public.payments;
CREATE TRIGGER guard_order_deposit_payment_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_order_deposit_payment_mutation();

-- A receipt is evidence of a held deposit only when the payment and liability
-- journal legs are committed together. The order lock serializes this with
-- checked settlement and the trigger above.
CREATE OR REPLACE FUNCTION public.collect_order_deposit_atomic(
  p_order_id text, p_store_id text, p_payment_id text,
  p_amount numeric, p_payment_method_id text, p_receiving_account_id text,
  p_liability_account_id text, p_transaction_date date,
  p_journal_transaction_id text, p_debit_entry_id text, p_credit_entry_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $collect$
DECLARE
  v_order public.orders%ROWTYPE;
  v_collected numeric(12,2);
  v_refunded numeric(12,2);
  v_method public.payment_methods%ROWTYPE;
  v_receiving public.chart_of_accounts%ROWTYPE;
  v_liability public.chart_of_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'active' OR v_order.store_id <> p_store_id THEN
    RAISE EXCEPTION 'Deposit collection requires an active order in the supplied store';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Deposit amount must be positive with two decimal places';
  END IF;
  SELECT * INTO v_method FROM public.payment_methods WHERE id = p_payment_method_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown deposit payment method'; END IF;
  IF v_method.is_active IS NOT TRUE OR v_method.is_deposit_eligible IS NOT TRUE
    OR COALESCE(v_method.gateway_provider, '') <> ''
    OR regexp_replace(lower(v_method.id || ' ' || v_method.name), '[^a-z]', '', 'g') ~ 'card|visa|master|xendit'
  THEN
    RAISE EXCEPTION 'Deposit collection requires an eligible manual payment method';
  END IF;
  SELECT * INTO v_receiving FROM public.chart_of_accounts WHERE id = p_receiving_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown receiving account'; END IF;
  SELECT * INTO v_liability FROM public.chart_of_accounts WHERE id = p_liability_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown deposit liability account'; END IF;
  IF v_receiving.is_active IS NOT TRUE
    OR v_receiving.account_type <> 'Asset'
    OR (v_receiving.store_id IS DISTINCT FROM p_store_id
      AND v_receiving.store_id IS DISTINCT FROM 'company')
    OR v_liability.is_active IS NOT TRUE
    OR v_liability.account_type <> 'Liability'
    OR (v_liability.store_id IS DISTINCT FROM p_store_id
      AND v_liability.store_id IS DISTINCT FROM 'company')
  THEN
    RAISE EXCEPTION 'Deposit accounts must be active asset and liability accounts for this store';
  END IF;
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type IN ('deposit', 'security_deposit')), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'deposit_refund'), 0)
  INTO v_collected, v_refunded
  FROM public.payments WHERE order_id = p_order_id;
  IF v_refunded > 0 OR v_collected + p_amount > v_order.security_deposit THEN
    RAISE EXCEPTION 'Deposit receipt exceeds the uncollected required deposit';
  END IF;

  INSERT INTO public.payments (
    id, order_id, store_id, amount, payment_type, payment_method_id,
    transaction_date, customer_id, account_id
  ) VALUES (
    p_payment_id, p_order_id, p_store_id, p_amount, 'deposit', p_payment_method_id,
    p_transaction_date, v_order.customer_id, p_receiving_account_id
  );
  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id, account_id,
    debit, credit, description, reference_type, reference_id, created_by
  ) VALUES
    (p_debit_entry_id, p_journal_transaction_id, to_char(p_transaction_date, 'YYYY-MM'),
      p_transaction_date, p_store_id, p_receiving_account_id, p_amount, 0,
      'Security deposit received', 'payment', p_payment_id, NULL),
    (p_credit_entry_id, p_journal_transaction_id, to_char(p_transaction_date, 'YYYY-MM'),
      p_transaction_date, p_store_id, p_liability_account_id, 0, p_amount,
      'Security deposit held', 'payment', p_payment_id, NULL);

  UPDATE public.orders SET deposit_method_id = p_payment_method_id,
    deposit_status = CASE WHEN v_collected + p_amount = security_deposit THEN 'paid' ELSE deposit_status END,
    updated_at = now()
  WHERE id = p_order_id;
END;
$collect$;

CREATE OR REPLACE FUNCTION public.settle_order_checked_atomic(
  p_order_id text, p_store_id text, p_settled_at timestamptz,
  p_final_balance_due numeric, p_final_payment jsonb, p_card_settlement jsonb,
  p_fleet_releases jsonb, p_journal_transaction_id text, p_journal_period text,
  p_journal_date date, p_journal_legs jsonb, p_absorbed_extension_payment_ids jsonb,
  p_card_fee_surcharge_delta numeric, p_return_charges_delta numeric,
  p_return_charges_note text, p_deposit_refund_payment jsonb,
  p_return_charge_payment jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $checked$
DECLARE
  v_order public.orders%ROWTYPE;
  v_collected numeric(12,2);
  v_prior_refunded numeric(12,2);
  v_prior_applied numeric(12,2);
  v_applied numeric(12,2);
  v_refund numeric(12,2);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'active' OR v_order.store_id <> p_store_id THEN
    RAISE EXCEPTION 'Order is not active in the supplied store';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type IN ('deposit', 'security_deposit')), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'deposit_refund'), 0)
  INTO v_collected, v_prior_refunded
  FROM public.payments WHERE order_id = p_order_id;

  SELECT COALESCE(SUM(debit), 0) INTO v_prior_applied
  FROM public.journal_entries
  WHERE reference_type = 'deposit' AND reference_id = p_order_id AND debit > 0;

  IF v_prior_refunded > 0 OR v_prior_applied > 0 OR v_collected > v_order.security_deposit THEN
    RAISE EXCEPTION 'Deposit ledger requires manual reconciliation before settlement';
  END IF;
  IF p_journal_legs IS NULL OR jsonb_typeof(p_journal_legs) <> 'array' THEN
    RAISE EXCEPTION 'Settlement journal legs must be an array';
  END IF;

  SELECT
    COALESCE(SUM((leg->>'debit')::numeric) FILTER (WHERE leg->>'reference_type' = 'deposit'), 0),
    COALESCE(SUM((leg->>'debit')::numeric) FILTER (WHERE leg->>'reference_type' = 'refund'), 0)
  INTO v_applied, v_refund
  FROM jsonb_array_elements(p_journal_legs) AS entries(leg);

  IF v_applied < 0 OR v_refund < 0 OR v_applied + v_refund > v_collected THEN
    RAISE EXCEPTION 'Deposit application/refund exceeds collected deposit';
  END IF;
  IF v_refund > 0 AND (p_deposit_refund_payment IS NULL
    OR (p_deposit_refund_payment->>'amount')::numeric IS DISTINCT FROM v_refund) THEN
    RAISE EXCEPTION 'Deposit refund payment does not match settlement journal';
  END IF;
  IF v_refund = 0 AND p_deposit_refund_payment IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected deposit refund payment';
  END IF;
  IF v_refund > 0 AND NOT EXISTS (
    SELECT 1 FROM public.payment_methods m
    WHERE m.id = p_deposit_refund_payment->>'payment_method_id'
      AND m.is_active IS TRUE AND COALESCE(m.gateway_provider, '') = ''
      AND regexp_replace(lower(m.id || ' ' || m.name), '[^a-z]', '', 'g') !~ 'card|visa|master|xendit'
  ) THEN
    RAISE EXCEPTION 'Deposit refund requires a manual, non-gateway method';
  END IF;

  PERFORM public.settle_order_atomic(
    p_order_id, p_store_id, p_settled_at, p_final_balance_due,
    p_final_payment, p_card_settlement, p_fleet_releases,
    p_journal_transaction_id, p_journal_period, p_journal_date,
    p_journal_legs, p_absorbed_extension_payment_ids,
    p_card_fee_surcharge_delta, p_return_charges_delta,
    p_return_charges_note, p_deposit_refund_payment,
    p_return_charge_payment
  );
END;
$checked$;

-- The API must use only the checked entry point. Its definer can still invoke
-- the old overloads internally; clients cannot call them directly.
DO $privileges$
DECLARE v_function record;
BEGIN
  FOR v_function IN
    SELECT oid::regprocedure AS signature FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'settle_order_atomic'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_function.signature);
  END LOOP;
END;
$privileges$;
REVOKE ALL ON FUNCTION public.settle_order_checked_atomic(
  text,text,timestamptz,numeric,jsonb,jsonb,jsonb,text,text,date,jsonb,jsonb,numeric,numeric,text,jsonb,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_checked_atomic(
  text,text,timestamptz,numeric,jsonb,jsonb,jsonb,text,text,date,jsonb,jsonb,numeric,numeric,text,jsonb,jsonb
) TO service_role;
REVOKE ALL ON FUNCTION public.collect_order_deposit_atomic(
  text,text,text,numeric,text,text,text,date,text,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_order_deposit_atomic(
  text,text,text,numeric,text,text,text,date,text,text,text
) TO service_role;

DO $verify$
BEGIN
  IF NOT has_function_privilege('service_role',
    'public.settle_order_checked_atomic(text,text,timestamptz,numeric,jsonb,jsonb,jsonb,text,text,date,jsonb,jsonb,numeric,numeric,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Checked settlement is not executable by service_role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'settle_order_atomic'
      AND has_function_privilege('service_role', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'An unchecked settlement overload is still executable by service_role';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.collect_order_deposit_atomic(text,text,text,numeric,text,text,text,date,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Atomic deposit collection is not executable by service_role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.payments'::regclass
      AND t.tgname = 'guard_order_deposit_payment_mutation'
      AND t.tgfoid = 'public.guard_order_deposit_payment_mutation()'::regprocedure
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'Deposit receipt guard trigger is missing or disabled';
  END IF;
END;
$verify$;
COMMIT;

SELECT p.proname, p.oid::regprocedure AS signature,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('settle_order_atomic', 'settle_order_checked_atomic')
ORDER BY p.proname, p.oid::regprocedure::text;
