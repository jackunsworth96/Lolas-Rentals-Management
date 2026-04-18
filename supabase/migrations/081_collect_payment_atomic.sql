-- ============================================================
-- 081: collect_payment_atomic RPC
-- Fixes AC-07: payment row + journal legs were written as two
-- separate awaited calls; a failure between them left a payment
-- with no accounting entry (or vice-versa).  This RPC wraps
-- both writes in a single PL/pgSQL transaction.
-- ============================================================

-- Add notes column to payments if it does not already exist.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.collect_payment_atomic(
  p_payment_id             text,
  p_order_id               text,
  p_store_id               text,
  p_amount                 numeric(12,2),
  p_payment_method_id      text,
  p_account_id             text,
  p_transaction_date       date,
  p_customer_id            text,
  p_payment_type           text,
  p_journal_transaction_id text,
  p_journal_period         text,
  p_journal_date           date,
  p_journal_legs           jsonb,
  p_notes                  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  leg jsonb;
BEGIN
  -- 1. Validate that the legs are balanced (debit sum = credit sum).
  --    assert_balanced_legs is a no-op for NULL / empty arrays.
  PERFORM public.assert_balanced_legs(p_journal_legs);

  -- 2. Insert the payment row.
  INSERT INTO public.payments (
    id, order_id, store_id, amount, payment_method_id, account_id,
    transaction_date, customer_id, payment_type, notes
  ) VALUES (
    p_payment_id,
    p_order_id,
    p_store_id,
    p_amount,
    p_payment_method_id,
    p_account_id,
    p_transaction_date,
    p_customer_id,
    p_payment_type,
    p_notes
  );

  -- 3. Insert one journal_entries row per leg.  Uses the same column
  --    shape as migrate 077 / 078 (debit + credit scalars, not amount+type).
  IF p_journal_legs IS NOT NULL AND jsonb_array_length(p_journal_legs) > 0 THEN
    FOR leg IN SELECT * FROM jsonb_array_elements(p_journal_legs) LOOP
      INSERT INTO public.journal_entries (
        id, transaction_id, period, date, store_id,
        account_id, debit, credit, description,
        reference_type, reference_id
      ) VALUES (
        leg->>'id',
        p_journal_transaction_id,
        p_journal_period,
        p_journal_date,
        p_store_id,
        leg->>'account_id',
        COALESCE((leg->>'debit')::numeric(12,2),  0),
        COALESCE((leg->>'credit')::numeric(12,2), 0),
        leg->>'description',
        leg->>'reference_type',
        leg->>'reference_id'
      );
    END LOOP;
  END IF;
END;
$$;


-- ============================================================
-- Lock down execution — only the API service role may invoke.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(
  text, text, text, numeric, text, text, date,
  text, text, text, text, date, jsonb, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(
  text, text, text, numeric, text, text, date,
  text, text, text, text, date, jsonb, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.collect_payment_atomic(
  text, text, text, numeric, text, text, date,
  text, text, text, text, date, jsonb, text
) TO service_role;
