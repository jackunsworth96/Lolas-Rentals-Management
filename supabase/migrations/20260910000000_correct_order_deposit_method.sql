-- Correct an active order's recorded deposit tender without leaving cash-up or
-- accounting pointed at the old asset account.
CREATE OR REPLACE FUNCTION public.correct_order_deposit_method(
  p_order_id text,
  p_payment_method_id text,
  p_account_id text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_updated_payments integer;
BEGIN
  SELECT status
  INTO v_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_status <> 'active' THEN
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
END;
$$;

REVOKE ALL ON FUNCTION public.correct_order_deposit_method(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_order_deposit_method(text, text, text) TO service_role;
