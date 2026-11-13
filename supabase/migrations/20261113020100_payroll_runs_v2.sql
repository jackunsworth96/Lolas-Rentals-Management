-- ============================================================
-- Payroll runs v2: gross-to-net payslips, split payments, void.
--
-- * payroll_runs gains a pay date, run type (regular / 13th month),
--   posted/voided status and totals. Only one *posted* run may exist per
--   store, period and run type, so a voided run can be re-run.
-- * payslips store the full breakdown needed to reprint a payslip:
--   employer contributions, 9pm cash already paid, 13th month accrual,
--   vehicle allowance section, the cash advance rows that were reduced,
--   the timesheets that were paid, and the journal transaction.
-- * payslip_payments holds one row per payment line (till, safe, GCash,
--   bank) with any transfer fee, so one person can be paid part cash and
--   part transfer.
-- * employee_allowance_ledger is the running vehicle allowance balance.
-- * run_payroll_v2 writes everything in one transaction, including the
--   cash advance settlement that previously ran after commit.
-- * void_payroll_run reverses a posted run.
-- ============================================================

-- ------------------------------------------------------------
-- payroll_runs
-- ------------------------------------------------------------
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS run_type               text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS pay_date               date,
  ADD COLUMN IF NOT EXISTS status                 text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS working_days_in_month  integer,
  ADD COLUMN IF NOT EXISTS employee_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gross            numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_net              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_employer_contrib numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transfer_fees    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at              timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by              text,
  ADD COLUMN IF NOT EXISTS void_reason            text;

ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_run_type_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_run_type_check
  CHECK (run_type IN ('regular', 'thirteenth_month'));
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE public.payroll_runs ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('posted', 'voided'));

UPDATE public.payroll_runs SET pay_date = period_end WHERE pay_date IS NULL;

-- The old guard blocked any second run for a period, including after a void.
DROP FUNCTION IF EXISTS public.run_payroll_atomic(jsonb, text[], text, text, date, date, text, uuid, jsonb);
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_period_store_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_posted_period_unique
  ON public.payroll_runs (store_id, period_start, period_end, run_type)
  WHERE status = 'posted';

-- ------------------------------------------------------------
-- payslips
-- ------------------------------------------------------------
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS run_type                    text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS period_start                date,
  ADD COLUMN IF NOT EXISTS period_end                  date,
  ADD COLUMN IF NOT EXISTS pay_date                    date,
  ADD COLUMN IF NOT EXISTS is_end_of_month             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_type                   text,
  ADD COLUMN IF NOT EXISTS days_worked                 numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_days                  numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_days                numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours              numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_pay                   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nine_pm_count               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nine_pm_prepaid             numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pom_revenue                 numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_rate             numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_pool                   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_headcount              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_sss                numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_philhealth         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_pagibig            numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thirteenth_month_accrual    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thirteenth_month_pay        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_allowance_opening   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_allowance_accrued   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_allowance_withdrawn numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_allowance_closing   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_leave_balance       numeric(6,2),
  ADD COLUMN IF NOT EXISTS sick_leave_balance          numeric(6,2),
  ADD COLUMN IF NOT EXISTS transfer_fees               numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_advance_deducted     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_allocations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_snapshot               jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS day_lines                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS warnings                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS timesheet_ids               text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS journal_transaction_id      text;

CREATE INDEX IF NOT EXISTS idx_payslips_employee_pay_date ON public.payslips (employee_id, pay_date);

-- ------------------------------------------------------------
-- payslip_payments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslip_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id      uuid NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  payroll_run_id  uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id     text NOT NULL,
  account_id      text NOT NULL REFERENCES public.chart_of_accounts(id),
  method          text NOT NULL DEFAULT 'cash',
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  fee             numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  reference       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payslip_payments_payslip ON public.payslip_payments (payslip_id);
ALTER TABLE public.payslip_payments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- employee_allowance_ledger (vehicle allowance)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_allowance_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     text NOT NULL REFERENCES public.employees(id),
  entry_date      date NOT NULL,
  entry_type      text NOT NULL CHECK (entry_type IN ('opening', 'accrual', 'withdrawal', 'adjustment')),
  -- Signed: accruals/openings add to the balance, withdrawals subtract.
  amount          numeric(12,2) NOT NULL,
  payroll_run_id  uuid REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  expense_id      text REFERENCES public.expenses(id) ON DELETE CASCADE,
  journal_transaction_id text,
  note            text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_allowance_ledger_employee ON public.employee_allowance_ledger (employee_id, entry_date);
ALTER TABLE public.employee_allowance_ledger ENABLE ROW LEVEL SECURITY;

-- Carry over any balance held on the legacy columns.
INSERT INTO public.employee_allowance_ledger (employee_id, entry_date, entry_type, amount, note)
SELECT e.id, CURRENT_DATE, 'opening',
       round(coalesce(e.bike_allowance_accrued, 0) - coalesce(e.bike_allowance_used, 0), 2),
       'Opening balance carried from legacy employee fields'
FROM public.employees e
WHERE round(coalesce(e.bike_allowance_accrued, 0) - coalesce(e.bike_allowance_used, 0), 2) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_allowance_ledger l
    WHERE l.employee_id = e.id AND l.entry_type = 'opening'
  );

-- ------------------------------------------------------------
-- run_payroll_v2
--
-- p_run:          { id, storeId, periodStart, periodEnd, payDate, runType,
--                   runBy, workingDaysInMonth, employeeCount, totalGross,
--                   totalNet, totalEmployerContrib, totalTransferFees }
-- p_transactions: [{ transactionId, period, date, storeId, legs: [...] }]
-- p_payslips:     one object per employee; see INSERT below. Each carries
--                 `payments` (payment lines) and `advanceAllocations`
--                 ([{ scheduleId, amount }]).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_payroll_v2(
  p_run           jsonb,
  p_transactions  jsonb,
  p_timesheet_ids text[],
  p_payslips      jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run_id    uuid := (p_run->>'id')::uuid;
  v_store     text := p_run->>'storeId';
  v_start     date := (p_run->>'periodStart')::date;
  v_end       date := (p_run->>'periodEnd')::date;
  v_pay_date  date := (p_run->>'payDate')::date;
  v_run_type  text := coalesce(p_run->>'runType', 'regular');
  v_run_by    text := p_run->>'runBy';
  v_updated   integer;
  tx          jsonb;
  leg         jsonb;
  slip        jsonb;
  pay         jsonb;
  alloc       jsonb;
  v_slip_id   uuid;
  v_debits    numeric;
  v_credits   numeric;
BEGIN
  IF EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE store_id = v_store AND period_start = v_start AND period_end = v_end
      AND run_type = v_run_type AND status = 'posted'
  ) THEN
    RAISE EXCEPTION 'Payroll already run for store % period % to %', v_store, v_start, v_end
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO payroll_runs (
    id, store_id, period_start, period_end, run_by, run_type, pay_date, status,
    working_days_in_month, employee_count, total_gross, total_net,
    total_employer_contrib, total_transfer_fees
  ) VALUES (
    v_run_id, v_store, v_start, v_end, v_run_by, v_run_type, v_pay_date, 'posted',
    nullif(p_run->>'workingDaysInMonth', '')::integer,
    coalesce((p_run->>'employeeCount')::integer, 0),
    coalesce((p_run->>'totalGross')::numeric, 0),
    coalesce((p_run->>'totalNet')::numeric, 0),
    coalesce((p_run->>'totalEmployerContrib')::numeric, 0),
    coalesce((p_run->>'totalTransferFees')::numeric, 0)
  );

  FOR tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    SELECT coalesce(sum((l->>'debit')::numeric(12,2)), 0), coalesce(sum((l->>'credit')::numeric(12,2)), 0)
      INTO v_debits, v_credits
      FROM jsonb_array_elements(tx->'legs') l;
    IF v_debits <> v_credits THEN
      RAISE EXCEPTION 'Payroll journal % is unbalanced (debits %, credits %)',
        tx->>'transactionId', v_debits, v_credits;
    END IF;

    FOR leg IN SELECT * FROM jsonb_array_elements(tx->'legs')
    LOOP
      INSERT INTO journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id, created_by
      ) VALUES (
        leg->>'id', tx->>'transactionId', tx->>'period', (tx->>'date')::date, tx->>'storeId',
        leg->>'account_id', (leg->>'debit')::numeric(12,2), (leg->>'credit')::numeric(12,2),
        leg->>'description', leg->>'reference_type', leg->>'reference_id', v_run_by
      );
    END LOOP;
  END LOOP;

  IF coalesce(array_length(p_timesheet_ids, 1), 0) > 0 THEN
    UPDATE timesheets SET payroll_status = 'Paid'
    WHERE id = ANY(p_timesheet_ids) AND payroll_status = 'Approved';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> array_length(p_timesheet_ids, 1) THEN
      RAISE EXCEPTION 'Timesheets changed while payroll was running (% of % still Approved). Refresh and try again.',
        v_updated, array_length(p_timesheet_ids, 1);
    END IF;
  END IF;

  FOR slip IN SELECT * FROM jsonb_array_elements(p_payslips)
  LOOP
    INSERT INTO payslips (
      payroll_run_id, store_id, employee_id, employee_name, run_type,
      period_start, period_end, pay_date, is_end_of_month, rate_type,
      days_worked, leave_days, holiday_days, overtime_hours, leave_pay,
      basic_pay, overtime_pay, nine_pm_bonus, nine_pm_count, nine_pm_prepaid,
      tips, tips_pool, tips_headcount, commission, pom_revenue, commission_rate,
      bike_allowance, sil_inflation, bonuses, holiday_adjustment, gross_pay,
      sss_deduction, philhealth_deduction, pagibig_deduction,
      employer_sss, employer_philhealth, employer_pagibig,
      cash_advance_deduction, other_deductions, total_deductions, net_pay,
      thirteenth_month_accrual, thirteenth_month_pay,
      vehicle_allowance_opening, vehicle_allowance_accrued,
      vehicle_allowance_withdrawn, vehicle_allowance_closing,
      holiday_leave_balance, sick_leave_balance, transfer_fees,
      legacy_advance_deducted, advance_allocations, rate_snapshot, day_lines, warnings,
      timesheet_ids, journal_transaction_id, paid_as, payment_method
    ) VALUES (
      v_run_id, v_store, slip->>'employeeId', slip->>'employeeName', v_run_type,
      v_start, v_end, v_pay_date, coalesce((slip->>'isEndOfMonth')::boolean, false), slip->>'rateType',
      coalesce((slip->>'daysWorked')::numeric, 0), coalesce((slip->>'leaveDays')::numeric, 0),
      coalesce((slip->>'holidayDays')::numeric, 0), coalesce((slip->>'overtimeHours')::numeric, 0),
      coalesce((slip->>'leavePay')::numeric, 0),
      coalesce((slip->>'basicPay')::numeric, 0), coalesce((slip->>'overtimePay')::numeric, 0),
      coalesce((slip->>'ninePmBonus')::numeric, 0), coalesce((slip->>'ninePmCount')::integer, 0),
      coalesce((slip->>'ninePmPrepaid')::numeric, 0),
      coalesce((slip->>'tips')::numeric, 0), coalesce((slip->>'tipsPool')::numeric, 0),
      coalesce((slip->>'tipsHeadcount')::integer, 0),
      coalesce((slip->>'commission')::numeric, 0), coalesce((slip->>'pomRevenue')::numeric, 0),
      coalesce((slip->>'commissionRate')::numeric, 0),
      coalesce((slip->>'vehicleAllowanceAccrued')::numeric, 0), 0,
      coalesce((slip->>'bonuses')::numeric, 0), coalesce((slip->>'holidayAdjustment')::numeric, 0),
      coalesce((slip->>'grossPay')::numeric, 0),
      coalesce((slip->>'sssDeduction')::numeric, 0), coalesce((slip->>'philhealthDeduction')::numeric, 0),
      coalesce((slip->>'pagibigDeduction')::numeric, 0),
      coalesce((slip->>'employerSss')::numeric, 0), coalesce((slip->>'employerPhilhealth')::numeric, 0),
      coalesce((slip->>'employerPagibig')::numeric, 0),
      coalesce((slip->>'cashAdvanceDeduction')::numeric, 0), coalesce((slip->>'otherDeductions')::numeric, 0),
      coalesce((slip->>'totalDeductions')::numeric, 0), coalesce((slip->>'netPay')::numeric, 0),
      coalesce((slip->>'thirteenthMonthAccrual')::numeric, 0), coalesce((slip->>'thirteenthMonthPay')::numeric, 0),
      coalesce((slip->>'vehicleAllowanceOpening')::numeric, 0), coalesce((slip->>'vehicleAllowanceAccrued')::numeric, 0),
      coalesce((slip->>'vehicleAllowanceWithdrawn')::numeric, 0), coalesce((slip->>'vehicleAllowanceClosing')::numeric, 0),
      nullif(slip->>'holidayLeaveBalance', '')::numeric, nullif(slip->>'sickLeaveBalance', '')::numeric,
      coalesce((slip->>'transferFees')::numeric, 0),
      coalesce((slip->>'legacyAdvanceDeducted')::numeric, 0),
      coalesce(slip->'advanceAllocations', '[]'::jsonb),
      coalesce(slip->'rateSnapshot', '[]'::jsonb),
      coalesce(slip->'dayLines', '[]'::jsonb),
      coalesce(slip->'warnings', '[]'::jsonb),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(slip->'timesheetIds', '[]'::jsonb))), '{}'),
      slip->>'journalTransactionId', slip->>'paidAs', slip->>'paymentMethod'
    )
    RETURNING id INTO v_slip_id;

    FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(slip->'payments', '[]'::jsonb))
    LOOP
      INSERT INTO payslip_payments (payslip_id, payroll_run_id, employee_id, account_id, method, amount, fee, reference)
      VALUES (
        v_slip_id, v_run_id, slip->>'employeeId', pay->>'accountId', coalesce(pay->>'method', 'cash'),
        (pay->>'amount')::numeric(12,2), coalesce((pay->>'fee')::numeric(12,2), 0), pay->>'reference'
      );
    END LOOP;

    FOR alloc IN SELECT * FROM jsonb_array_elements(coalesce(slip->'advanceAllocations', '[]'::jsonb))
    LOOP
      UPDATE cash_advance_schedules
      SET remaining_balance = round(coalesce(remaining_balance, 0) - (alloc->>'amount')::numeric, 2),
          deducted = round(coalesce(remaining_balance, 0) - (alloc->>'amount')::numeric, 2) <= 0,
          deducted_at = CASE
            WHEN round(coalesce(remaining_balance, 0) - (alloc->>'amount')::numeric, 2) <= 0 THEN v_pay_date
            ELSE deducted_at END
      WHERE id = alloc->>'scheduleId'
        AND coalesce(remaining_balance, 0) >= (alloc->>'amount')::numeric - 0.005;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cash advance schedule % no longer has % outstanding', alloc->>'scheduleId', alloc->>'amount';
      END IF;
    END LOOP;

    IF coalesce((slip->>'legacyAdvanceDeducted')::numeric, 0) > 0 THEN
      UPDATE employees
      SET current_cash_advance = greatest(0, round(current_cash_advance - (slip->>'legacyAdvanceDeducted')::numeric, 2))
      WHERE id = slip->>'employeeId';
    END IF;

    UPDATE employees
    SET thirteenth_month_accrued = round(
          coalesce(thirteenth_month_accrued, 0)
          + coalesce((slip->>'thirteenthMonthAccrual')::numeric, 0)
          - coalesce((slip->>'thirteenthMonthPay')::numeric, 0), 2),
        updated_at = now()
    WHERE id = slip->>'employeeId';

    IF coalesce((slip->>'vehicleAllowanceAccrued')::numeric, 0) > 0 THEN
      INSERT INTO employee_allowance_ledger (
        employee_id, entry_date, entry_type, amount, payroll_run_id, journal_transaction_id, note, created_by
      ) VALUES (
        slip->>'employeeId', v_pay_date, 'accrual', (slip->>'vehicleAllowanceAccrued')::numeric(12,2),
        v_run_id, slip->>'journalTransactionId', 'Monthly vehicle allowance', v_run_by
      );
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- void_payroll_run: reverse journals, re-open timesheets, restore
-- advances, 13th month and allowance balances.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_payroll_run(
  p_run_id        uuid,
  p_voided_by     text,
  p_reason        text,
  p_reversal_date date
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run   payroll_runs%ROWTYPE;
  slip    payslips%ROWTYPE;
  alloc   jsonb;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;
  IF v_run.status <> 'posted' THEN
    RAISE EXCEPTION 'Payroll run % is already %', p_run_id, v_run.status;
  END IF;

  INSERT INTO journal_entries (
    id, transaction_id, period, date, store_id, account_id, debit, credit,
    description, reference_type, reference_id, created_by
  )
  SELECT gen_random_uuid()::text,
         md5('payroll-void:' || je.transaction_id)::uuid::text,
         to_char(p_reversal_date, 'YYYY-MM'),
         p_reversal_date,
         je.store_id,
         je.account_id,
         je.credit,
         je.debit,
         'VOID: ' || coalesce(je.description, ''),
         je.reference_type,
         je.reference_id,
         p_voided_by
  FROM journal_entries je
  WHERE je.transaction_id IN (
    SELECT journal_transaction_id FROM payslips
    WHERE payroll_run_id = p_run_id AND journal_transaction_id IS NOT NULL
  );

  FOR slip IN SELECT * FROM payslips WHERE payroll_run_id = p_run_id
  LOOP
    UPDATE timesheets SET payroll_status = 'Approved'
    WHERE id = ANY(slip.timesheet_ids) AND payroll_status = 'Paid';

    FOR alloc IN SELECT * FROM jsonb_array_elements(slip.advance_allocations)
    LOOP
      UPDATE cash_advance_schedules
      SET remaining_balance = round(coalesce(remaining_balance, 0) + (alloc->>'amount')::numeric, 2),
          deducted = false,
          deducted_at = NULL
      WHERE id = alloc->>'scheduleId';
    END LOOP;

    UPDATE employees
    SET current_cash_advance = round(current_cash_advance + slip.legacy_advance_deducted, 2),
        thirteenth_month_accrued = round(
          coalesce(thirteenth_month_accrued, 0) - slip.thirteenth_month_accrual + slip.thirteenth_month_pay, 2),
        updated_at = now()
    WHERE id = slip.employee_id;
  END LOOP;

  DELETE FROM employee_allowance_ledger WHERE payroll_run_id = p_run_id;

  UPDATE payroll_runs
  SET status = 'voided', voided_at = now(), voided_by = p_voided_by, void_reason = p_reason
  WHERE id = p_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_payroll_v2(jsonb, jsonb, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_payroll_v2(jsonb, jsonb, text[], jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.void_payroll_run(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.void_payroll_run(uuid, text, text, date) TO service_role;
