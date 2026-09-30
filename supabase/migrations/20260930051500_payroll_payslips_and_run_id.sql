-- ============================================================
-- Payroll audit fixes (part 2): persist per-employee payslips.
--
-- Previously a payroll run wrote only a (store_id, period_start, period_end)
-- header row to payroll_runs and posted journal entries — the actual
-- per-employee breakdown (basic pay, commission, deductions, net pay) was
-- discarded once the API response was sent, so a run could never be
-- reprinted, audited, or reconciled after the fact.
--
-- This adds a `payslips` table keyed to `payroll_runs`, and extends
-- run_payroll_atomic to accept a client-generated run id plus the payslip
-- rows, writing everything in the same transaction as the journal entries.
-- ============================================================

-- ------------------------------------------------------------
-- SECTION A: payslips table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslips (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id          uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  store_id                text NOT NULL,
  employee_id             text NOT NULL,
  employee_name           text NOT NULL,
  basic_pay               numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay            numeric(12,2) NOT NULL DEFAULT 0,
  nine_pm_bonus           numeric(12,2) NOT NULL DEFAULT 0,
  tips                    numeric(12,2) NOT NULL DEFAULT 0,
  commission              numeric(12,2) NOT NULL DEFAULT 0,
  bike_allowance          numeric(12,2) NOT NULL DEFAULT 0,
  sil_inflation           numeric(12,2) NOT NULL DEFAULT 0,
  bonuses                 numeric(12,2) NOT NULL DEFAULT 0,
  holiday_adjustment      numeric(12,2) NOT NULL DEFAULT 0,
  gross_pay               numeric(12,2) NOT NULL DEFAULT 0,
  sss_deduction           numeric(12,2) NOT NULL DEFAULT 0,
  philhealth_deduction    numeric(12,2) NOT NULL DEFAULT 0,
  pagibig_deduction       numeric(12,2) NOT NULL DEFAULT 0,
  cash_advance_deduction  numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions        numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions        numeric(12,2) NOT NULL DEFAULT 0,
  net_pay                 numeric(12,2) NOT NULL DEFAULT 0,
  paid_as                 text,
  payment_method          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payslips_run_employee_unique UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON public.payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON public.payslips(payroll_run_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own store payslips" ON public.payslips;
CREATE POLICY "Staff read own store payslips"
  ON public.payslips FOR SELECT
  USING (store_id = ANY(public.user_store_ids()));

-- ------------------------------------------------------------
-- SECTION B: run_payroll_atomic — accept run id + payslip rows
--
-- The pre-existing signature (from 080) took no run id and no payslip data.
-- We extend it so the caller generates the payroll_runs.id up front and the
-- full payslip breakdown is written atomically alongside the journal.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_payroll_atomic(jsonb, text[], text, text, date, date, text);

CREATE OR REPLACE FUNCTION public.run_payroll_atomic(
  p_transactions  jsonb,
  p_timesheet_ids text[],
  p_status        text,
  p_store_id      text,
  p_period_start  date,
  p_period_end    date,
  p_notes         text,
  p_run_id        uuid,
  p_payslips      jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tx jsonb;
  leg jsonb;
  slip jsonb;
BEGIN
  -- Idempotency guard: one payroll run per (store_id, period_start, period_end).
  INSERT INTO public.payroll_runs (id, store_id, period_start, period_end, run_by)
  VALUES (p_run_id, p_store_id, p_period_start, p_period_end, p_notes)
  ON CONFLICT (store_id, period_start, period_end) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll already run for store % period % to %',
      p_store_id, p_period_start, p_period_end
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Insert all journal entries for all store allocations
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

  -- Bulk update timesheet status
  IF array_length(p_timesheet_ids, 1) > 0 THEN
    UPDATE timesheets
    SET payroll_status = p_status
    WHERE id = ANY(p_timesheet_ids);
  END IF;

  -- Persist the per-employee payslip breakdown for audit / reprint.
  FOR slip IN SELECT * FROM jsonb_array_elements(p_payslips)
  LOOP
    INSERT INTO public.payslips (
      payroll_run_id, store_id, employee_id, employee_name,
      basic_pay, overtime_pay, nine_pm_bonus, tips, commission,
      bike_allowance, sil_inflation, bonuses, holiday_adjustment, gross_pay,
      sss_deduction, philhealth_deduction, pagibig_deduction,
      cash_advance_deduction, other_deductions, total_deductions, net_pay,
      paid_as, payment_method
    ) VALUES (
      p_run_id, p_store_id, slip->>'employeeId', slip->>'employeeName',
      (slip->>'basicPay')::numeric(12,2), (slip->>'overtimePay')::numeric(12,2),
      (slip->>'ninePmBonus')::numeric(12,2), (slip->>'tips')::numeric(12,2),
      (slip->>'commission')::numeric(12,2), (slip->>'bikeAllowance')::numeric(12,2),
      (slip->>'silInflation')::numeric(12,2), (slip->>'bonuses')::numeric(12,2),
      (slip->>'holidayAdjustment')::numeric(12,2), (slip->>'grossPay')::numeric(12,2),
      (slip->>'sssDeduction')::numeric(12,2), (slip->>'philhealthDeduction')::numeric(12,2),
      (slip->>'pagibigDeduction')::numeric(12,2), (slip->>'cashAdvanceDeduction')::numeric(12,2),
      (slip->>'otherDeductions')::numeric(12,2), (slip->>'totalDeductions')::numeric(12,2),
      (slip->>'netPay')::numeric(12,2), slip->>'paidAs', slip->>'paymentMethod'
    )
    ON CONFLICT (payroll_run_id, employee_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- SECTION C: Lock down EXECUTE privileges (pattern from 066 / 080)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text, uuid, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text, uuid, jsonb) TO service_role;
