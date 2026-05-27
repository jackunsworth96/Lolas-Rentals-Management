-- ============================================================
-- 071: Add SET search_path = public to functions missing it.
--
-- This historical migration originally recreated many functions as
-- separate top-level statements. Supabase CLI v2.72 can pass that file
-- as one prepared statement during fresh local replay, so keep the
-- migration as a single DO block and alter the existing functions in
-- place.
-- ============================================================

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'cancel_order_raw_atomic',
        'confirm_extend_order_atomic',
        'confirm_extend_raw_atomic',
        'create_maintenance_expense',
        'delete_expense_with_journal',
        'delete_maintenance_expense',
        'paw_card_assign_paw_reference',
        'reconcile_cash_atomic',
        'run_payroll_atomic',
        'update_maintenance_expense'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.signature);
  END LOOP;
END $$;
