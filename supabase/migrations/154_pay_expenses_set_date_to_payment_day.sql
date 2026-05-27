-- ============================================================
-- 152: When paying unpaid expenses, update expenses.date to
--      the Manila calendar date of payment so they appear on
--      the correct day in the cash-up page.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pay_expenses_atomic(
  p_expense_ids text[], p_paid_at timestamp with time zone,
  p_paid_from text, p_legs jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  leg jsonb;
BEGIN
  UPDATE expenses
  SET status    = 'paid',
      paid_at   = p_paid_at,
      paid_from = p_paid_from,
      date      = (p_paid_at AT TIME ZONE 'Asia/Manila')::date
  WHERE id = ANY(p_expense_ids);
  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs)
  LOOP
    INSERT INTO journal_entries (
      id, transaction_id, period, date, store_id,
      account_id, debit, credit, description,
      reference_type, reference_id, created_by
    ) VALUES (
      leg->>'id', leg->>'transaction_id', leg->>'period', (leg->>'date')::date,
      leg->>'store_id', leg->>'account_id', (leg->>'debit')::numeric(12,2),
      (leg->>'credit')::numeric(12,2), leg->>'description',
      leg->>'reference_type', leg->>'reference_id', NULL
    );
  END LOOP;
END;
$function$;
