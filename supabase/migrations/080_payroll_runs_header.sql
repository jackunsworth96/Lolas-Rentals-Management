-- ============================================================
-- 080: Payroll idempotency guard (AC-06)
--
-- Adds a header table `payroll_runs` keyed by (store_id, period_start,
-- period_end) and wires run_payroll_atomic to insert into it at the very
-- start of the transaction. A second attempt to run payroll for the same
-- store + period raises a unique_violation (SQLSTATE 23505), which the API
-- route maps to HTTP 409 PAYROLL_ALREADY_RUN.
-- ============================================================

-- ------------------------------------------------------------
-- SECTION A: payroll_runs header table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  run_at        timestamptz NOT NULL DEFAULT now(),
  run_by        text,
  CONSTRAINT payroll_runs_period_store_unique UNIQUE (store_id, period_start, period_end)
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own store payroll runs" ON public.payroll_runs;
CREATE POLICY "Staff read own store payroll runs"
  ON public.payroll_runs FOR SELECT
  USING (store_id = ANY(public.user_store_ids()));


-- ------------------------------------------------------------
-- SECTION B: run_payroll_atomic with idempotency guard
--
-- The pre-080 signature was (jsonb, text[], text). We extend it with the
-- store_id + period window + run_by so the header row can be written in the
-- same transaction as the journal entries. CREATE OR REPLACE cannot change
-- the argument list, so drop the old signature first.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.run_payroll_atomic(jsonb, text[], text);

CREATE OR REPLACE FUNCTION public.run_payroll_atomic(
  p_transactions  jsonb,
  p_timesheet_ids text[],
  p_status        text,
  p_store_id      text,
  p_period_start  date,
  p_period_end    date,
  p_notes         text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tx jsonb;
  leg jsonb;
BEGIN
  -- Idempotency guard: one payroll run per (store_id, period_start, period_end).
  INSERT INTO public.payroll_runs (store_id, period_start, period_end, run_by)
  VALUES (p_store_id, p_period_start, p_period_end, p_notes)
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

END;
$$;


-- ------------------------------------------------------------
-- SECTION C: Lock down EXECUTE privileges (pattern from 066)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.run_payroll_atomic(jsonb, text[], text, text, date, date, text) TO service_role;
