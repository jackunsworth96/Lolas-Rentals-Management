-- ============================================================
-- Payroll supporting flows:
--   * vehicle allowance withdrawals and adjustments
--   * 9pm return payouts linked to their timesheet
--   * SSS / PhilHealth / Pag-IBIG remittances
--   * probation leave accrual
--   * can_run_payroll permission
-- ============================================================

-- ------------------------------------------------------------
-- 9pm payouts: the till expense created from a timesheet points back to it.
-- ------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS timesheet_id text REFERENCES public.timesheets(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_timesheet_unique
  ON public.expenses (timesheet_id) WHERE timesheet_id IS NOT NULL;

-- ------------------------------------------------------------
-- withdraw_vehicle_allowance(p jsonb)
--   { expenseId, employeeId, employeeName, storeId, date, amount, paidFrom,
--     payableAccountId, note, createdBy, transactionId, legIds: [id, id] }
-- Records the till payout as a paid expense (so Cash Up sees it) whose
-- account is the allowance liability, and reduces the employee's balance.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_vehicle_allowance(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount  numeric(12,2) := (p->>'amount')::numeric(12,2);
  v_balance numeric(12,2);
  v_date    date := (p->>'date')::date;
  v_desc    text := 'Vehicle allowance: ' || coalesce(p->>'employeeName', p->>'employeeId')
                    || coalesce(' - ' || nullif(p->>'note', ''), '');
BEGIN
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  PERFORM 1 FROM employees WHERE id = p->>'employeeId' FOR UPDATE;
  SELECT coalesce(sum(amount), 0) INTO v_balance
  FROM employee_allowance_ledger WHERE employee_id = p->>'employeeId';
  IF v_amount > v_balance + 0.005 THEN
    RAISE EXCEPTION 'Withdrawal of % exceeds the vehicle allowance balance of %', v_amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO expenses (id, store_id, date, category, description, amount, paid_from, employee_id, account_id, status, paid_at)
  VALUES (p->>'expenseId', p->>'storeId', v_date, 'Staff Vehicle Allowance', v_desc, v_amount,
          p->>'paidFrom', p->>'employeeId', p->>'payableAccountId', 'paid', now());

  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                               description, reference_type, reference_id, created_by)
  VALUES
    (p->'legIds'->>0, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     p->>'payableAccountId', v_amount, 0, v_desc, 'expense', p->>'expenseId', p->>'createdBy'),
    (p->'legIds'->>1, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     p->>'paidFrom', 0, v_amount, v_desc, 'expense', p->>'expenseId', p->>'createdBy');

  INSERT INTO employee_allowance_ledger (employee_id, entry_date, entry_type, amount, expense_id,
                                         journal_transaction_id, note, created_by)
  VALUES (p->>'employeeId', v_date, 'withdrawal', -v_amount, p->>'expenseId',
          p->>'transactionId', nullif(p->>'note', ''), p->>'createdBy');
END;
$$;

-- ------------------------------------------------------------
-- adjust_vehicle_allowance(p jsonb)
--   { employeeId, employeeName, storeId, date, amount (signed), entryType
--     ('opening' | 'adjustment'), note, expenseAccountId, payableAccountId,
--     createdBy, transactionId, legIds: [id, id] }
-- Sets an opening balance or corrects one. The liability moves with it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_vehicle_allowance(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount  numeric(12,2) := (p->>'amount')::numeric(12,2);
  v_abs     numeric(12,2) := abs((p->>'amount')::numeric(12,2));
  v_balance numeric(12,2);
  v_date    date := (p->>'date')::date;
  v_desc    text := 'Vehicle allowance ' || coalesce(p->>'entryType', 'adjustment') || ': '
                    || coalesce(p->>'employeeName', p->>'employeeId')
                    || coalesce(' - ' || nullif(p->>'note', ''), '');
BEGIN
  IF v_amount = 0 THEN
    RAISE EXCEPTION 'Adjustment amount cannot be zero';
  END IF;

  PERFORM 1 FROM employees WHERE id = p->>'employeeId' FOR UPDATE;
  SELECT coalesce(sum(amount), 0) INTO v_balance
  FROM employee_allowance_ledger WHERE employee_id = p->>'employeeId';
  IF v_balance + v_amount < -0.005 THEN
    RAISE EXCEPTION 'Adjustment would make the vehicle allowance balance negative (%)', v_balance + v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                               description, reference_type, reference_id, created_by)
  VALUES
    (p->'legIds'->>0, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     CASE WHEN v_amount > 0 THEN p->>'expenseAccountId' ELSE p->>'payableAccountId' END,
     v_abs, 0, v_desc, 'allowance_adjustment', p->>'employeeId', p->>'createdBy'),
    (p->'legIds'->>1, p->>'transactionId', to_char(v_date, 'YYYY-MM'), v_date, p->>'storeId',
     CASE WHEN v_amount > 0 THEN p->>'payableAccountId' ELSE p->>'expenseAccountId' END,
     0, v_abs, v_desc, 'allowance_adjustment', p->>'employeeId', p->>'createdBy');

  INSERT INTO employee_allowance_ledger (employee_id, entry_date, entry_type, amount,
                                         journal_transaction_id, note, created_by)
  VALUES (p->>'employeeId', v_date, coalesce(p->>'entryType', 'adjustment'), v_amount,
          p->>'transactionId', nullif(p->>'note', ''), p->>'createdBy');
END;
$$;

-- ------------------------------------------------------------
-- Contribution remittances
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contribution_remittances (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency                  text NOT NULL CHECK (agency IN ('sss', 'philhealth', 'pagibig')),
  contribution_month      text NOT NULL CHECK (contribution_month ~ '^\d{4}-\d{2}$'),
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  fee                     numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  paid_from_account_id    text NOT NULL REFERENCES public.chart_of_accounts(id),
  paid_date               date NOT NULL,
  reference_no            text,
  note                    text,
  journal_transaction_id  text NOT NULL,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remittances_month ON public.contribution_remittances (contribution_month, agency);
ALTER TABLE public.contribution_remittances ENABLE ROW LEVEL SECURITY;

-- record_contribution_remittance(p jsonb)
--   { id, agency, month, amount, fee, paidFrom, paidDate, referenceNo, note,
--     createdBy, transaction: { transactionId, period, date, storeId, legs } }
CREATE OR REPLACE FUNCTION public.record_contribution_remittance(p jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tx        jsonb := p->'transaction';
  leg       jsonb;
  v_debits  numeric;
  v_credits numeric;
BEGIN
  SELECT coalesce(sum((l->>'debit')::numeric(12,2)), 0), coalesce(sum((l->>'credit')::numeric(12,2)), 0)
    INTO v_debits, v_credits
    FROM jsonb_array_elements(tx->'legs') l;
  IF v_debits <> v_credits OR v_debits = 0 THEN
    RAISE EXCEPTION 'Remittance journal is unbalanced (debits %, credits %)', v_debits, v_credits;
  END IF;

  INSERT INTO contribution_remittances (id, agency, contribution_month, amount, fee, paid_from_account_id,
                                        paid_date, reference_no, note, journal_transaction_id, created_by)
  VALUES ((p->>'id')::uuid, p->>'agency', p->>'month', (p->>'amount')::numeric(12,2),
          coalesce((p->>'fee')::numeric(12,2), 0), p->>'paidFrom', (p->>'paidDate')::date,
          nullif(p->>'referenceNo', ''), nullif(p->>'note', ''), tx->>'transactionId', p->>'createdBy');

  FOR leg IN SELECT * FROM jsonb_array_elements(tx->'legs')
  LOOP
    INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                                 description, reference_type, reference_id, created_by)
    VALUES (leg->>'id', tx->>'transactionId', tx->>'period', (tx->>'date')::date, tx->>'storeId',
            leg->>'account_id', (leg->>'debit')::numeric(12,2), (leg->>'credit')::numeric(12,2),
            leg->>'description', 'contribution_remittance', p->>'id', p->>'createdBy');
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Probation leave accrual (days earned per month served while on probation)
-- ------------------------------------------------------------
ALTER TABLE public.leave_config
  ADD COLUMN IF NOT EXISTS probation_accrual_holiday numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS probation_accrual_sick    numeric(5,2) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- can_run_payroll: running, voiding and remitting. can_view_payroll keeps
-- read and download access.
-- ------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission)
SELECT rp.role_id, 'can_run_payroll'
FROM public.role_permissions rp
WHERE rp.permission = 'can_view_payroll'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_id = rp.role_id AND x.permission = 'can_run_payroll'
  );

REVOKE EXECUTE ON FUNCTION public.withdraw_vehicle_allowance(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.withdraw_vehicle_allowance(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.adjust_vehicle_allowance(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.adjust_vehicle_allowance(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_contribution_remittance(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_contribution_remittance(jsonb) TO service_role;
