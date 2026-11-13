-- ============================================================
-- 9pm return payouts
--   sync_nine_pm_payout(p jsonb)
--     { timesheetId, expenseId, storeId, date, employeeId, employeeName,
--       amount, count, paidFrom, wagesAccountId, createdBy, transactionId,
--       legIds: [id, id] }
-- Replaces the till payout linked to a timesheet: the previous expense and its
-- journal are removed, and a new paid expense (DR wages / CR till) is written
-- when amount > 0. Refuses once the timesheet has been paid through payroll.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_nine_pm_payout(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status  text;
  v_old     text;
  v_amount  numeric(12,2) := coalesce((p->>'amount')::numeric(12,2), 0);
  v_date    date := (p->>'date')::date;
  v_desc    text := '9pm returns: ' || coalesce(p->>'employeeName', p->>'employeeId')
                    || ' x' || coalesce(p->>'count', '0') || ' (' || (p->>'date') || ')';
BEGIN
  SELECT payroll_status INTO v_status FROM timesheets WHERE id = p->>'timesheetId' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet % not found', p->>'timesheetId';
  END IF;
  IF v_status = 'Paid' THEN
    RAISE EXCEPTION 'Timesheet % has already been paid through payroll', p->>'timesheetId'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_old FROM expenses WHERE timesheet_id = p->>'timesheetId';
  IF v_old IS NOT NULL THEN
    DELETE FROM journal_entries WHERE reference_type = 'expense' AND reference_id = v_old;
    DELETE FROM expenses WHERE id = v_old;
  END IF;

  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO expenses (id, store_id, date, category, description, amount, paid_from, employee_id,
                        account_id, status, paid_at, timesheet_id)
  VALUES (p->>'expenseId', p->>'storeId', v_date, '9pm Returns', v_desc, v_amount, p->>'paidFrom',
          p->>'employeeId', p->>'wagesAccountId', 'paid', now(), p->>'timesheetId');

  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                               description, reference_type, reference_id, created_by)
  VALUES
    (p->'legIds'->>0, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     p->>'wagesAccountId', v_amount, 0, v_desc, 'expense', p->>'expenseId', p->>'createdBy'),
    (p->'legIds'->>1, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     p->>'paidFrom', 0, v_amount, v_desc, 'expense', p->>'expenseId', p->>'createdBy');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_nine_pm_payout(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_nine_pm_payout(jsonb) TO service_role;
