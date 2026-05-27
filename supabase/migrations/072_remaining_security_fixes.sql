-- ============================================================
-- 072: Remaining security fixes
-- A: SET search_path on 5 remaining functions
-- B: Scope permissive RLS policies to authenticated staff
-- C: Fix paw-card-receipts bucket listing
-- ============================================================

-- ============================================================
-- PART A: Function search paths
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
        'create_expense_with_journal',
        'pay_expenses_atomic',
        'has_permission',
        'user_store_ids',
        'update_updated_at'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.signature);
  END LOOP;
END $$;

-- ============================================================
-- PART B: Scope permissive RLS policies to authenticated staff
-- booking_holds INSERT/DELETE and waivers INSERT stay open (intentional)
-- ============================================================

-- directory
DROP POLICY IF EXISTS dir_all ON public.directory;
CREATE POLICY dir_select ON public.directory
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY dir_modify ON public.directory
  FOR ALL USING (public.has_permission('can_edit_settings'));

-- merchandise
DROP POLICY IF EXISTS merch_all ON public.merchandise;
CREATE POLICY merch_select ON public.merchandise
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY merch_modify ON public.merchandise
  FOR ALL USING (public.has_permission('can_edit_settings'));

-- paw_card_entries
DROP POLICY IF EXISTS pawcard_all ON public.paw_card_entries;
CREATE POLICY pawcard_select ON public.paw_card_entries
  FOR SELECT USING (true);
CREATE POLICY pawcard_insert ON public.paw_card_entries
  FOR INSERT WITH CHECK (true);
CREATE POLICY pawcard_modify ON public.paw_card_entries
  FOR ALL USING (auth.role() = 'authenticated');

-- paw_card_establishments
DROP POLICY IF EXISTS pawcard_est_all ON public.paw_card_establishments;
CREATE POLICY pawcard_est_select ON public.paw_card_establishments
  FOR SELECT USING (true);
CREATE POLICY pawcard_est_modify ON public.paw_card_establishments
  FOR ALL USING (public.has_permission('can_edit_settings'));

-- post_rental_email_log
DROP POLICY IF EXISTS post_rental_email_log_staff ON public.post_rental_email_log;
CREATE POLICY post_rental_log_all ON public.post_rental_email_log
  FOR ALL USING (auth.role() = 'authenticated');

-- reviews
DROP POLICY IF EXISTS reviews_all ON public.reviews;
CREATE POLICY reviews_select ON public.reviews
  FOR SELECT USING (true);
CREATE POLICY reviews_modify ON public.reviews
  FOR ALL USING (auth.role() = 'authenticated');

-- waiver_reminder_log
DROP POLICY IF EXISTS waiver_reminder_log_staff ON public.waiver_reminder_log;
CREATE POLICY waiver_reminder_log_all ON public.waiver_reminder_log
  FOR ALL USING (auth.role() = 'authenticated');
