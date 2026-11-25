-- A write-off that clears an order's balance now marks the order's remaining
-- unpaid extension and add-on IOUs as absorbed, as collect_payment_atomic does
-- when a payment clears it. Before this, a part payment followed by a write-off
-- of the shortfall left the IOU pending, and settlement then treated it as
-- still owed and applied the security deposit to it (LR-1120-4A7D).

CREATE OR REPLACE FUNCTION public.write_off_balance_atomic(
  p_order_id text,
  p_amount numeric,
  p_reason text,
  p_receivable_acct text,
  p_income_acct text,
  p_journal_tx_id text,
  p_journal_date date,
  p_journal_period text,
  p_note_id text,
  p_body text,
  p_employee_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id text;
  v_status text;
  v_final_total numeric;
  v_paid numeric;
  v_balance numeric;
  v_remaining numeric;
  v_take numeric;
  v_payment record;
  v_description text;
BEGIN
  SELECT store_id, status, COALESCE(final_total, 0)
  INTO v_store_id, v_status, v_final_total
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancelled orders cannot have a balance written off');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Write-off amount must be greater than zero');
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN payment_type IN ('deposit', 'security_deposit') THEN 0
      WHEN payment_type = 'extension' AND settlement_status IN ('pending', 'absorbed') THEN 0
      WHEN payment_type = 'addon' AND payment_method_id = 'pending'
           AND settlement_status IN ('pending', 'absorbed') THEN 0
      WHEN payment_type = 'refund' THEN -amount
      ELSE amount
    END
  ), 0)
  INTO v_paid
  FROM payments
  WHERE order_id = p_order_id;

  v_balance := v_final_total - v_paid;

  IF p_amount > v_balance THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Write-off of %s is more than the balance due (%s)', p_amount, GREATEST(v_balance, 0)));
  END IF;

  v_description := 'Balance written off: order ' || p_order_id
    || COALESCE(' — ' || NULLIF(btrim(p_reason), ''), '');

  v_remaining := p_amount;
  FOR v_payment IN
    SELECT id, amount
    FROM payments
    WHERE order_id = p_order_id
      AND payment_type = 'extension'
      AND settlement_status = 'pending'
    ORDER BY created_at DESC, id DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_payment.amount);
    IF v_take <= 0 THEN CONTINUE; END IF;

    IF v_take >= v_payment.amount THEN
      DELETE FROM payments WHERE id = v_payment.id;
    ELSE
      UPDATE payments SET amount = amount - v_take WHERE id = v_payment.id;
    END IF;

    IF p_receivable_acct IS NOT NULL AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id, store_id, date, period
      ) VALUES
      (gen_random_uuid()::text, p_journal_tx_id, p_income_acct, v_take, 0,
       v_description || ' (income reversed)', 'write_off', v_payment.id, v_store_id, p_journal_date, p_journal_period),
      (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, 0, v_take,
       v_description, 'write_off', v_payment.id, v_store_id, p_journal_date, p_journal_period);
    END IF;

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 AND p_receivable_acct IS NOT NULL AND p_income_acct IS NOT NULL THEN
    INSERT INTO journal_entries (
      id, transaction_id, account_id, debit, credit,
      description, reference_type, reference_id, store_id, date, period
    ) VALUES
    (gen_random_uuid()::text, p_journal_tx_id, p_income_acct, v_remaining, 0,
     v_description || ' (income reversed)', 'write_off', p_order_id, v_store_id, p_journal_date, p_journal_period),
    (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, 0, v_remaining,
     v_description, 'write_off', p_order_id, v_store_id, p_journal_date, p_journal_period);
  END IF;

  IF v_balance - p_amount <= 0 THEN
    UPDATE payments
    SET settlement_status = 'absorbed'
    WHERE order_id = p_order_id
      AND settlement_status = 'pending'
      AND (payment_type = 'extension' OR (payment_type = 'addon' AND payment_method_id = 'pending'));
  END IF;

  UPDATE orders
  SET final_total = final_total - p_amount,
      balance_due = GREATEST(v_balance - p_amount, 0),
      updated_at  = now()
  WHERE id = p_order_id;

  INSERT INTO order_notes (id, order_id, store_id, kind, body, meta, employee_id)
  VALUES (p_note_id, p_order_id, v_store_id, 'note', p_body,
          jsonb_build_object('writeOff', p_amount, 'reason', NULLIF(btrim(p_reason), ''), 'balanceBefore', v_balance),
          p_employee_id);

  RETURN jsonb_build_object('success', true, 'balanceBefore', v_balance, 'balanceAfter', v_balance - p_amount);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.write_off_balance_atomic(
  text, numeric, text, text, text, text, date, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_off_balance_atomic(
  text, numeric, text, text, text, text, date, text, text, text, text
) TO service_role;
