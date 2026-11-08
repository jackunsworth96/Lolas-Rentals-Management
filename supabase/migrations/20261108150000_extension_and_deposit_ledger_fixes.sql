-- Extensions on active orders:
--  * the extension charge is income when it is agreed, paid or not, so the
--    receivable and income legs are always posted (an unpaid extension is
--    collected later against the receivable by collect_payment_atomic);
--  * a paid extension also books the money into the account it was received
--    into (p_payment_account), clearing the receivable.
-- Dropped and recreated rather than overloaded so PostgREST never has two
-- candidates for the same named-argument call.

DROP FUNCTION IF EXISTS public.confirm_extend_order_atomic(
  text, text, timestamptz, integer, jsonb, numeric, text, text, numeric, text,
  date, text, text, text, text, boolean, text, text, text, date, text, text
);

CREATE FUNCTION public.confirm_extend_order_atomic(
  p_order_id text,
  p_order_item_id text,
  p_new_dropoff timestamptz,
  p_new_days integer,
  p_addon_updates jsonb,
  p_total_delta numeric,
  p_payment_id text,
  p_store_id text,
  p_amount numeric,
  p_payment_method_id text,
  p_transaction_date date,
  p_settlement_status text,
  p_settlement_ref text,
  p_customer_id text,
  p_order_item_id_fk text,
  p_is_paid boolean,
  p_receivable_acct text,
  p_income_acct text,
  p_journal_tx_id text,
  p_journal_date date,
  p_journal_period text,
  p_ext_description text,
  p_payment_account text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addon jsonb;
BEGIN
  UPDATE order_items
  SET
    original_dropoff_datetime = COALESCE(original_dropoff_datetime, dropoff_datetime),
    dropoff_datetime          = p_new_dropoff,
    rental_days_count         = p_new_days
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
    SET
      final_total = COALESCE(final_total, 0) + p_total_delta,
      balance_due = COALESCE(balance_due, 0) + p_total_delta
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
      CASE WHEN p_is_paid THEN COALESCE(p_payment_account, p_receivable_acct) ELSE null END
    );

    IF p_receivable_acct IS NOT NULL AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, p_amount, 0,
       p_ext_description, 'extension', p_payment_id, p_store_id, p_journal_date, p_journal_period),
      (gen_random_uuid()::text, p_journal_tx_id, p_income_acct, 0, p_amount,
       p_ext_description || ' (income)', 'extension', p_payment_id, p_store_id, p_journal_date, p_journal_period);

      IF p_is_paid AND p_payment_account IS NOT NULL THEN
        INSERT INTO journal_entries (
          id, transaction_id, account_id, debit, credit,
          description, reference_type, reference_id,
          store_id, date, period
        ) VALUES
        (gen_random_uuid()::text, p_journal_tx_id, p_payment_account, p_amount, 0,
         p_ext_description || ' (payment received)', 'payment', p_payment_id, p_store_id, p_journal_date, p_journal_period),
        (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, 0, p_amount,
         p_ext_description || ' (receivable reduced)', 'payment', p_payment_id, p_store_id, p_journal_date, p_journal_period);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_extend_order_atomic(
  text, text, timestamptz, integer, jsonb, numeric, text, text, numeric, text,
  date, text, text, text, text, boolean, text, text, text, date, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_extend_order_atomic(
  text, text, timestamptz, integer, jsonb, numeric, text, text, numeric, text,
  date, text, text, text, text, boolean, text, text, text, date, text, text, text
) TO service_role;

-- Today's settlement of LR-1031-10B4 paid its 1,000 deposit refund out of the
-- till instead of the deposit envelope, and its 300 fuel charge reduced the
-- receivable instead of being recorded as income.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = 'tx-fix-settle-20261108-lr1031') THEN
    RETURN;
  END IF;
  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, 'tx-fix-settle-20261108-lr1031', '2026-11', '2026-11-08', 'store-lolas', 'CASH-LOLA', 1000, 0,
     'Correction: LR-1031-10B4 deposit refund was paid from the deposit envelope, not the till', 'deposit_envelope_transfer', '04a9e194-4af6-51d1-8a5f-3b67cc9b42ed'),
    (gen_random_uuid()::text, 'tx-fix-settle-20261108-lr1031', '2026-11', '2026-11-08', 'store-lolas', 'CASH-DEPOSIT-ENVELOPE', 0, 1000,
     'Correction: LR-1031-10B4 deposit refund was paid from the deposit envelope, not the till', 'deposit_envelope_transfer', '04a9e194-4af6-51d1-8a5f-3b67cc9b42ed'),
    (gen_random_uuid()::text, 'tx-fix-settle-20261108-lr1031', '2026-11', '2026-11-08', 'store-lolas', 'CARD-TERMINAL-store-lolas', 300, 0,
     'Correction: LR-1031-10B4 fuel charge is income, not a receivable reduction', 'adjustment', '04a9e194-4af6-51d1-8a5f-3b67cc9b42ed'),
    (gen_random_uuid()::text, 'tx-fix-settle-20261108-lr1031', '2026-11', '2026-11-08', 'store-lolas', 'INCOME-RENTAL-store-lolas', 0, 300,
     'Correction: LR-1031-10B4 fuel charge is income, not a receivable reduction', 'adjustment', '04a9e194-4af6-51d1-8a5f-3b67cc9b42ed');
END $$;
