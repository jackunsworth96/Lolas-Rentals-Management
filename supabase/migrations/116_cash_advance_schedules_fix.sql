-- ============================================================
-- 116: Fix cash_advance_schedules to match what the payroll
--      adapter actually reads.
--
-- The original table used (installment_amount, period_start,
-- period_end, deducted) — a per-row-per-period model that the
-- application code never used.  The payroll adapter expects a
-- single-row-per-advance model with:
--   deduction_per_period  — fixed amount deducted each payroll run
--   remaining_balance     — decremented after every deduction
--   start_date            — first payroll period to deduct from
--
-- We add the new columns (keeping the old ones so no data is lost
-- for any existing rows) and also add a proper write policy so
-- the service role can create and update schedules.
-- ============================================================

ALTER TABLE cash_advance_schedules
  ADD COLUMN IF NOT EXISTS deduction_per_period  numeric(12,2),
  ADD COLUMN IF NOT EXISTS remaining_balance      numeric(12,2),
  ADD COLUMN IF NOT EXISTS start_date             date;

-- Write policy: only the service role (API) may insert/update/delete.
-- The existing cas_select policy (FOR SELECT USING (true)) already
-- grants read access; we add a blanket write guard.
CREATE POLICY cas_modify ON cash_advance_schedules
  FOR ALL
  USING (public.has_permission('can_approve_timesheets'));

-- ============================================================
-- Helper RPC: atomically increment an employee's lump-sum
-- cash advance balance. Called by the grant-cash-advance
-- use-case when repaymentType = 'lump-sum'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_cash_advance(
  p_employee_id text,
  p_amount      numeric
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE employees
  SET current_cash_advance = current_cash_advance + p_amount
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_cash_advance(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cash_advance(text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cash_advance(text, numeric) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_cash_advance(text, numeric) TO service_role;

-- ============================================================
-- Helper RPC: atomically clear an employee's lump-sum balance
-- after it is deducted in a payroll run.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_cash_advance(
  p_employee_id text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE employees
  SET current_cash_advance = 0
  WHERE id = p_employee_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_cash_advance(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_cash_advance(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_cash_advance(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.clear_cash_advance(text) TO service_role;
