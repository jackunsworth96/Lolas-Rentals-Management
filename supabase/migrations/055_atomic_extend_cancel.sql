-- ============================================================
-- ATOMIC EXTEND & CANCEL RPCs
-- Wraps multi-step write operations in single transactions so
-- no partial state is ever committed.
-- ============================================================

-- ── RPC 1: cancel_order_raw_atomic ──────────────────────────
-- Cancels an orders_raw record and releases its booking hold.
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_order_raw_atomic(
  p_order_id        text,
  p_cancelled_at    timestamptz,
  p_cancelled_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_reference text;
  v_current_status  text;
BEGIN
  -- 1. Lock and fetch the order
  SELECT order_reference, status
  INTO v_order_reference, v_current_status
  FROM orders_raw
  WHERE id::text = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;

  -- 2. Update order status
  UPDATE orders_raw
  SET
    status           = 'cancelled',
    cancelled_at     = p_cancelled_at,
    cancelled_reason = p_cancelled_reason
  WHERE id::text = p_order_id;

  -- 3. Release booking hold (if exists — no error if not found)
  IF v_order_reference IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE order_reference = v_order_reference;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── RPC 2: confirm_extend_raw_atomic ────────────────────────
-- Commits an extension on an orders_raw record.
-- All business logic is handled in JS before this call; this
-- RPC only performs the writes atomically.
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_extend_raw_atomic(
  p_order_id           text,
  p_new_dropoff        timestamptz,
  p_payment_id         text,
  p_store_id           text,
  p_amount             numeric,
  p_payment_method_id  text,
  p_transaction_date   date,
  p_settlement_status  text,
  p_settlement_ref     text,
  p_raw_order_id       text,
  p_is_paid            boolean,
  p_receivable_acct    text,
  p_income_acct        text,
  p_journal_tx_id      text,
  p_journal_date       date,
  p_journal_period     text,
  p_ext_description    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update dropoff datetime on orders_raw
  UPDATE orders_raw
  SET dropoff_datetime = p_new_dropoff
  WHERE id::text = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- 2. Insert payment record (only when there is a non-zero amount)
  IF p_amount > 0 THEN
    INSERT INTO payments (
      id, store_id, order_id, raw_order_id, order_item_id,
      order_addon_id, payment_type, amount, payment_method_id,
      transaction_date, settlement_status, settlement_ref,
      customer_id, account_id
    ) VALUES (
      p_payment_id, p_store_id, null, p_raw_order_id::uuid, null,
      null, 'extension', p_amount, p_payment_method_id,
      p_transaction_date, p_settlement_status, p_settlement_ref,
      null, CASE WHEN p_is_paid THEN p_receivable_acct ELSE null END
    );

    -- 3. Journal entries (only when the payment is settled/paid)
    IF p_is_paid AND p_receivable_acct IS NOT NULL
       AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_receivable_acct, p_amount, 0,
        p_ext_description, 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      ),
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_income_acct, 0, p_amount,
        p_ext_description || ' (income)', 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── RPC 3: confirm_extend_order_atomic ──────────────────────
-- Commits an extension on a processed order.
-- Handles order_items update, order_addons recalculation,
-- orders total adjustment, payment insert, and journal entries.
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_extend_order_atomic(
  p_order_id           text,
  p_order_item_id      text,
  p_new_dropoff        timestamptz,
  p_new_days           integer,
  p_addon_updates      jsonb,
  -- Array of {id: text, new_total: numeric}
  p_total_delta        numeric,
  p_payment_id         text,
  p_store_id           text,
  p_amount             numeric,
  p_payment_method_id  text,
  p_transaction_date   date,
  p_settlement_status  text,
  p_settlement_ref     text,
  p_customer_id        text,
  p_order_item_id_fk   text,
  p_is_paid            boolean,
  p_receivable_acct    text,
  p_income_acct        text,
  p_journal_tx_id      text,
  p_journal_date       date,
  p_journal_period     text,
  p_ext_description    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_addon    jsonb;
  v_cur_total numeric;
  v_cur_final numeric;
BEGIN
  -- 1. Update order_items
  UPDATE order_items
  SET
    dropoff_datetime  = p_new_dropoff,
    rental_days_count = p_new_days
  WHERE id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Order item not found');
  END IF;

  -- 2. Update per-day add-on totals
  FOR v_addon IN SELECT * FROM jsonb_array_elements(p_addon_updates)
  LOOP
    UPDATE order_addons
    SET total_amount = (v_addon->>'new_total')::numeric
    WHERE id = (v_addon->>'id')::text;
  END LOOP;

  -- 3. Adjust order final_total and balance_due
  IF p_total_delta <> 0 THEN
    UPDATE orders
    SET
      final_total = COALESCE(final_total, 0) + p_total_delta,
      balance_due = COALESCE(balance_due, 0) + p_total_delta
    WHERE id = p_order_id;
  END IF;

  -- 4. Insert payment
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

    -- 5. Journal entries (only when the payment is settled/paid)
    IF p_is_paid AND p_receivable_acct IS NOT NULL
       AND p_income_acct IS NOT NULL THEN
      INSERT INTO journal_entries (
        id, transaction_id, account_id, debit, credit,
        description, reference_type, reference_id,
        store_id, date, period
      ) VALUES
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_receivable_acct, p_amount, 0,
        p_ext_description, 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      ),
      (
        gen_random_uuid()::text, p_journal_tx_id,
        p_income_acct, 0, p_amount,
        p_ext_description || ' (income)', 'extension', p_payment_id,
        p_store_id, p_journal_date, p_journal_period
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
