-- ============================================================
-- 071: Add SET search_path = public to all functions missing it
-- Fixes Supabase security lint warnings
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_order_raw_atomic(
  p_order_id text,
  p_cancelled_at timestamp with time zone,
  p_cancelled_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_reference text;
  v_current_status  text;
BEGIN
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
  UPDATE orders_raw
  SET status           = 'cancelled',
      cancelled_at     = p_cancelled_at,
      cancelled_reason = p_cancelled_reason
  WHERE id::text = p_order_id;
  IF v_order_reference IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE session_token = v_order_reference;
  END IF;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.confirm_extend_raw_atomic(
  p_order_id text, p_new_dropoff timestamp with time zone, p_payment_id text,
  p_store_id text, p_amount numeric, p_payment_method_id text,
  p_transaction_date date, p_settlement_status text, p_settlement_ref text,
  p_raw_order_id text, p_is_paid boolean, p_receivable_acct text,
  p_income_acct text, p_journal_tx_id text, p_journal_date date,
  p_journal_period text, p_ext_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE orders_raw
  SET dropoff_datetime = p_new_dropoff
  WHERE id::text = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
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

CREATE OR REPLACE FUNCTION public.create_maintenance_expense(
  p_expense_id text, p_maintenance_id text, p_store_id text, p_date date,
  p_category text, p_description text, p_amount numeric, p_paid_from text,
  p_vehicle_id text, p_employee_id text, p_expense_account_id text,
  p_cash_account_id text, p_je_debit_id text, p_je_credit_id text,
  p_transaction_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_period text;
BEGIN
  v_period := to_char(p_date, 'YYYY-MM');
  INSERT INTO expenses (
    id, maintenance_id, store_id, date, category,
    description, amount, paid_from, vehicle_id,
    employee_id, account_id
  ) VALUES (
    p_expense_id, p_maintenance_id, p_store_id, p_date, p_category,
    p_description, p_amount, p_cash_account_id, p_vehicle_id,
    p_employee_id, p_expense_account_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_debit_id, p_transaction_id, v_period, p_date, p_store_id,
    p_expense_account_id, p_amount, 0, p_description, 'expense', p_expense_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_credit_id, p_transaction_id, v_period, p_date, p_store_id,
    p_cash_account_id, 0, p_amount, p_description, 'expense', p_expense_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_expense_with_journal(
  p_expense_id text, p_reference_type text, p_reference_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  DELETE FROM journal_entries
  WHERE reference_type = p_reference_type
    AND reference_id = p_reference_id;
  DELETE FROM expenses
  WHERE id = p_expense_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_maintenance_expense(
  p_maintenance_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_expense_id text;
BEGIN
  SELECT id INTO v_expense_id
  FROM expenses
  WHERE maintenance_id = p_maintenance_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  DELETE FROM journal_entries
  WHERE reference_type = 'expense'
    AND reference_id = v_expense_id;
  DELETE FROM expenses WHERE id = v_expense_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.paw_card_assign_paw_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  suffix text;
BEGIN
  IF NEW.paw_reference IS NULL OR length(trim(NEW.paw_reference)) = 0 THEN
    suffix := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    NEW.paw_reference := 'PAW-' || to_char(timezone('Asia/Manila', now())::date, 'YYYYMMDD') || '-' || suffix;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_cash_atomic(
  p_id text, p_store_id text, p_date date, p_opening_balance numeric,
  p_expected_cash numeric, p_actual_counted numeric, p_variance numeric,
  p_variance_type text, p_submitted_by text, p_submitted_at timestamp with time zone,
  p_is_locked boolean, p_overridden_by text, p_overridden_at timestamp with time zone,
  p_override_reason text, p_till_counted numeric, p_deposits_counted numeric,
  p_till_denoms jsonb, p_deposit_denoms jsonb, p_till_expected numeric,
  p_deposits_expected numeric, p_till_variance numeric, p_deposit_variance numeric,
  p_closing_balance numeric
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  INSERT INTO cash_reconciliation (
    id, store_id, date, opening_balance, expected_cash,
    actual_counted, variance, variance_type, submitted_by,
    submitted_at, is_locked, overridden_by, overridden_at,
    override_reason, till_counted, deposits_counted,
    till_denoms, deposit_denoms, till_expected, deposits_expected,
    till_variance, deposit_variance, closing_balance
  ) VALUES (
    p_id, p_store_id, p_date, p_opening_balance, p_expected_cash,
    p_actual_counted, p_variance, p_variance_type, p_submitted_by,
    p_submitted_at, p_is_locked, p_overridden_by, p_overridden_at,
    p_override_reason, p_till_counted, p_deposits_counted,
    p_till_denoms, p_deposit_denoms, p_till_expected, p_deposits_expected,
    p_till_variance, p_deposit_variance, p_closing_balance
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id          = EXCLUDED.store_id,
    date              = EXCLUDED.date,
    opening_balance   = EXCLUDED.opening_balance,
    expected_cash     = EXCLUDED.expected_cash,
    actual_counted    = EXCLUDED.actual_counted,
    variance          = EXCLUDED.variance,
    variance_type     = EXCLUDED.variance_type,
    submitted_by      = EXCLUDED.submitted_by,
    submitted_at      = EXCLUDED.submitted_at,
    is_locked         = EXCLUDED.is_locked,
    overridden_by     = EXCLUDED.overridden_by,
    overridden_at     = EXCLUDED.overridden_at,
    override_reason   = EXCLUDED.override_reason,
    till_counted      = EXCLUDED.till_counted,
    deposits_counted  = EXCLUDED.deposits_counted,
    till_denoms       = EXCLUDED.till_denoms,
    deposit_denoms    = EXCLUDED.deposit_denoms,
    till_expected     = EXCLUDED.till_expected,
    deposits_expected = EXCLUDED.deposits_expected,
    till_variance     = EXCLUDED.till_variance,
    deposit_variance  = EXCLUDED.deposit_variance,
    closing_balance   = EXCLUDED.closing_balance;
  UPDATE cash_reconciliation
  SET is_locked = true
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_payroll_atomic(
  p_transactions jsonb, p_timesheet_ids text[], p_status text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  tx jsonb;
  leg jsonb;
BEGIN
  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    FOR leg IN SELECT * FROM jsonb_array_elements(tx->'legs')
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id',
        tx->>'transactionId',
        tx->>'period',
        (tx->>'date')::date,
        tx->>'storeId',
        leg->>'account_id',
        (leg->>'debit')::numeric(12,2),
        (leg->>'credit')::numeric(12,2),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id',
        NULL
      );
    END LOOP;
  END LOOP;
  IF array_length(p_timesheet_ids, 1) > 0 THEN
    UPDATE timesheets
    SET payroll_status = p_status
    WHERE id = ANY(p_timesheet_ids);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_maintenance_expense(
  p_expense_id text, p_amount numeric, p_description text,
  p_expense_account_id text, p_cash_account_id text,
  p_je_debit_id text, p_je_credit_id text, p_transaction_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_store_id text;
  v_date     date;
  v_period   text;
BEGIN
  SELECT store_id, date INTO v_store_id, v_date
  FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense % not found', p_expense_id;
  END IF;
  v_period := to_char(v_date, 'YYYY-MM');
  UPDATE expenses
  SET amount      = p_amount,
      description = p_description,
      account_id  = p_expense_account_id,
      paid_from   = p_cash_account_id
  WHERE id = p_expense_id;
  DELETE FROM journal_entries
  WHERE reference_type = 'expense'
    AND reference_id = p_expense_id;
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_debit_id, p_transaction_id, v_period, v_date, v_store_id,
    p_expense_account_id, p_amount, 0, p_description, 'expense', p_expense_id
  );
  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, debit, credit, description, reference_type, reference_id
  ) VALUES (
    p_je_credit_id, p_transaction_id, v_period, v_date, v_store_id,
    p_cash_account_id, 0, p_amount, p_description, 'expense', p_expense_id
  );
END;
$function$;
