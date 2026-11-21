-- Moving the return earlier on an order whose extension is still unpaid:
-- shrink the extension instead of collecting in full and refunding.
--
-- change_return_time_recalc_atomic moves the item's return, sets the new
-- rental_days_count and per-day add-on totals, lowers orders.final_total and
-- balance_due by p_reduction, and takes the same amount off the pending
-- extension payments (newest first; a row reduced to 0 is deleted). The
-- extension income was booked when it was agreed (Dr receivable / Cr income),
-- so each reduction is reversed with Dr income / Cr receivable against the
-- payment it came off. The return_change note is written in the same
-- transaction.

CREATE OR REPLACE FUNCTION public.change_return_time_recalc_atomic(
  p_order_id text,
  p_order_item_id text,
  p_new_dropoff timestamptz,
  p_new_days integer,
  p_addon_updates jsonb,
  p_reduction numeric,
  p_new_to_label text,
  p_receivable_acct text,
  p_income_acct text,
  p_journal_tx_id text,
  p_journal_date date,
  p_journal_period text,
  p_description text,
  p_note_id text,
  p_body text,
  p_meta jsonb,
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
  v_pending numeric;
  v_remaining numeric;
  v_take numeric;
  v_ref_updated boolean := false;
  v_addon jsonb;
  v_payment record;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status NOT IN ('active', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active or confirmed orders can have their return time changed');
  END IF;

  IF p_reduction <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nothing to recalculate');
  END IF;

  IF EXISTS (
    SELECT 1 FROM payments
    WHERE order_id = p_order_id
      AND payment_type = 'extension'
      AND COALESCE(settlement_status, '') <> 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An extension on this order has already been paid; use Refund instead');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM payments
  WHERE order_id = p_order_id
    AND payment_type = 'extension'
    AND settlement_status = 'pending';

  IF v_pending < p_reduction THEN
    RETURN jsonb_build_object('success', false, 'error', 'The unpaid extension is smaller than the reduction; reload and try again');
  END IF;

  UPDATE order_items
  SET
    original_dropoff_datetime = COALESCE(original_dropoff_datetime, dropoff_datetime),
    dropoff_datetime          = p_new_dropoff,
    rental_days_count         = p_new_days
  WHERE id = p_order_item_id
    AND order_id = p_order_id
    AND pickup_datetime IS NOT NULL
    AND pickup_datetime < p_new_dropoff;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order item not found or return is not after pickup');
  END IF;

  FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(p_addon_updates, '[]'::jsonb))
  LOOP
    UPDATE order_addons
    SET total_amount = (v_addon->>'new_total')::numeric
    WHERE id = (v_addon->>'id')::text
      AND order_id = p_order_id;
  END LOOP;

  UPDATE orders
  SET
    final_total = COALESCE(final_total, 0) - p_reduction,
    balance_due = COALESCE(balance_due, 0) - p_reduction
  WHERE id = p_order_id;

  v_remaining := p_reduction;
  FOR v_payment IN
    SELECT id, amount, settlement_ref
    FROM payments
    WHERE order_id = p_order_id
      AND payment_type = 'extension'
      AND settlement_status = 'pending'
    ORDER BY created_at DESC, id DESC
    FOR UPDATE
  LOOP
    v_take := LEAST(v_remaining, v_payment.amount);

    IF v_take > 0 THEN
      IF v_take >= v_payment.amount THEN
        DELETE FROM payments WHERE id = v_payment.id;
      ELSE
        UPDATE payments SET amount = amount - v_take WHERE id = v_payment.id;
      END IF;

      IF p_receivable_acct IS NOT NULL AND p_income_acct IS NOT NULL THEN
        INSERT INTO journal_entries (
          id, transaction_id, account_id, debit, credit,
          description, reference_type, reference_id,
          store_id, date, period
        ) VALUES
        (gen_random_uuid()::text, p_journal_tx_id, p_income_acct, v_take, 0,
         p_description || ' (income reversed)', 'extension', v_payment.id, v_store_id, p_journal_date, p_journal_period),
        (gen_random_uuid()::text, p_journal_tx_id, p_receivable_acct, 0, v_take,
         p_description, 'extension', v_payment.id, v_store_id, p_journal_date, p_journal_period);
      END IF;

      v_remaining := v_remaining - v_take;
    END IF;

    IF NOT v_ref_updated AND v_take < v_payment.amount THEN
      UPDATE payments
      SET settlement_ref = regexp_replace(settlement_ref, '→\s*.+$', '→ ' || p_new_to_label)
      WHERE id = v_payment.id
        AND settlement_ref IS NOT NULL;
      v_ref_updated := true;
    END IF;

    EXIT WHEN v_remaining <= 0 AND v_ref_updated;
  END LOOP;

  INSERT INTO order_notes (id, order_id, store_id, kind, body, meta, employee_id)
  VALUES (p_note_id, p_order_id, v_store_id, 'return_change', p_body, p_meta, p_employee_id);

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.change_return_time_recalc_atomic(
  text, text, timestamptz, integer, jsonb, numeric, text, text, text, text,
  date, text, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_return_time_recalc_atomic(
  text, text, timestamptz, integer, jsonb, numeric, text, text, text, text,
  date, text, text, text, text, jsonb, text
) TO service_role;
