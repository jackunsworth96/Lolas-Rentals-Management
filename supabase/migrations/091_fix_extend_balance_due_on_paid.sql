-- ============================================================
-- 091: Fix confirm_extend_order_atomic — do not increment
-- balance_due when the extension is paid at time of extending.
--
-- Problem: previous version (055, re-declared in 071) always did
--   balance_due = COALESCE(balance_due, 0) + p_total_delta
-- regardless of p_is_paid. When staff marked an extension as
-- "Paid now", a payment row was inserted (offsetting the delta
-- in derived balances), but the stored orders.balance_due was
-- still incremented — overstating the balance by the extension
-- amount.
--
-- Fix: only increment balance_due when the extension is unpaid
-- (pending IOU). When paid, final_total still grows by the delta
-- but balance_due is left untouched, because the matching
-- payment row covers the new charge.
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_extend_order_atomic(
  p_order_id text, p_order_item_id text, p_new_dropoff timestamp with time zone,
  p_new_days integer, p_addon_updates jsonb, p_total_delta numeric,
  p_payment_id text, p_store_id text, p_amount numeric, p_payment_method_id text,
  p_transaction_date date, p_settlement_status text, p_settlement_ref text,
  p_customer_id text, p_order_item_id_fk text, p_is_paid boolean,
  p_receivable_acct text, p_income_acct text, p_journal_tx_id text,
  p_journal_date date, p_journal_period text, p_ext_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_addon    jsonb;
  v_cur_total numeric;
  v_cur_final numeric;
BEGIN
  UPDATE order_items
  SET dropoff_datetime  = p_new_dropoff,
      rental_days_count = p_new_days
  WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found');
  END IF;
  FOR v_addon IN SELECT * FROM jsonb_array_elements(p_addon_updates)
  LOOP
    UPDATE order_addons
    SET total_amount = (v_addon->>'new_total')::numeric
    WHERE id = (v_addon->>'id')::text;
  END LOOP;
  IF p_total_delta <> 0 THEN
    UPDATE orders
    SET final_total = COALESCE(final_total, 0) + p_total_delta,
        balance_due = CASE
          WHEN p_is_paid THEN balance_due
          ELSE COALESCE(balance_due, 0) + p_total_delta
        END
    WHERE id = p_order_id;
  END IF;
  IF p_amount > 0 THEN
    INSERT INTO payments (
      id, store_id, order_id, raw_order_id, order_item_id,
      order_addon_id, payment_type, amount, payment_method_id,
      transaction_date, settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_payment_id, p_store_id, p_order_id, null, p_order_item_id_fk,
      null, 'extension', p_amount, p_payment_method_id,
      p_transaction_date, p_settlement_status, p_settlement_ref,
      p_customer_id,
      CASE WHEN p_is_paid THEN p_receivable_acct ELSE null END
    );
    IF p_is_paid AND p_receivable_acct IS NOT NULL AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, p_amount, 0,
       p_ext_description, 'extension', p_payment_id, p_store_id, p_journal_date, p_journal_period),
      (gen_random_uuid()::text, p_journal_tx_id, p_income_acct, 0, p_amount,
       p_ext_description || ' (income)', 'extension', p_payment_id, p_store_id, p_journal_date, p_journal_period);
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
