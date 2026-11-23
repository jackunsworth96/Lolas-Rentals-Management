-- Changing the deposit method on an order that was activated without one only
-- relabelled the order: there was no deposit payment to move, so cash-up and
-- the ledger never saw the deposit (LR-1122-8044, 22 Nov 2026). When no deposit
-- payment exists, record it today against the chosen account.
DROP FUNCTION IF EXISTS public.correct_order_deposit_method(text, text, text);

CREATE OR REPLACE FUNCTION public.correct_order_deposit_method(
  p_order_id text,
  p_payment_method_id text,
  p_account_id text,
  p_liability_account_id text DEFAULT NULL,
  p_created_by text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated_payments integer;
  v_payment_id text;
  v_tx_id text;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status <> 'active' THEN
    RAISE EXCEPTION 'Only active order deposits can be changed';
  END IF;

  UPDATE public.orders
  SET deposit_method_id = p_payment_method_id,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.payments
  SET payment_method_id = p_payment_method_id,
      account_id = p_account_id
  WHERE order_id = p_order_id
    AND payment_type IN ('deposit', 'security_deposit');

  GET DIAGNOSTICS v_updated_payments = ROW_COUNT;

  IF v_updated_payments > 0 THEN
    UPDATE public.journal_entries
    SET account_id = p_account_id
    WHERE reference_type = 'payment'
      AND debit > 0
      AND reference_id IN (
        SELECT id
        FROM public.payments
        WHERE order_id = p_order_id
          AND payment_type IN ('deposit', 'security_deposit')
      );
    RETURN v_updated_payments;
  END IF;

  IF coalesce(v_order.security_deposit, 0) <= 0 THEN
    RETURN 0;
  END IF;
  IF p_liability_account_id IS NULL THEN
    RAISE EXCEPTION 'No deposit liability account found for store %', v_order.store_id;
  END IF;

  v_payment_id := gen_random_uuid()::text;
  v_tx_id := gen_random_uuid()::text;

  INSERT INTO public.payments (id, store_id, order_id, raw_order_id, payment_type, amount, payment_method_id,
                               transaction_date, customer_id, account_id, notes)
  VALUES (v_payment_id, v_order.store_id, p_order_id, v_order.raw_order_id::uuid, 'deposit', v_order.security_deposit,
          p_payment_method_id, v_today, v_order.customer_id, p_account_id,
          'Recorded when the deposit method was set after activation');

  INSERT INTO public.journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                                      description, reference_type, reference_id, created_by)
  VALUES
    (gen_random_uuid()::text, v_tx_id, to_char(v_today, 'YYYY-MM'), v_today, v_order.store_id, p_account_id,
     v_order.security_deposit, 0, 'Order ' || p_order_id || ' deposit received', 'payment', v_payment_id, p_created_by),
    (gen_random_uuid()::text, v_tx_id, to_char(v_today, 'YYYY-MM'), v_today, v_order.store_id, p_liability_account_id,
     0, v_order.security_deposit, 'Order ' || p_order_id || ' deposit liability', 'payment', v_payment_id, p_created_by);

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_order_deposit_method(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_order_deposit_method(text, text, text, text, text) TO service_role;
