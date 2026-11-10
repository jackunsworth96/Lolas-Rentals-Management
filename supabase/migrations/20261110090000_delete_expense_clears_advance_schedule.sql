-- Deleting a cash advance expense must also remove its payroll deduction
-- schedule, otherwise the employee is still deducted for money never paid.
-- Refuse once payroll has started recovering the advance.
CREATE OR REPLACE FUNCTION public.delete_expense_with_journal(p_expense_id text, p_reference_type text, p_reference_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cash_advance_schedules
    WHERE expense_id = p_expense_id
      AND remaining_balance < installment_amount
  ) THEN
    RAISE EXCEPTION 'This cash advance has already been partly repaid through payroll and cannot be deleted';
  END IF;

  DELETE FROM cash_advance_schedules WHERE expense_id = p_expense_id;
  DELETE FROM journal_entries
  WHERE reference_type = p_reference_type
    AND reference_id = p_reference_id;
  DELETE FROM expenses
  WHERE id = p_expense_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_expense_with_journal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expense_with_journal(text, text, text) TO service_role;
