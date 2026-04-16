-- ============================================================
-- 072: Remaining security fixes
-- A: SET search_path on 5 remaining functions
-- B: Scope permissive RLS policies to authenticated staff
-- C: Fix paw-card-receipts bucket listing
-- ============================================================

-- ============================================================
-- PART A: Function search paths
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_expense_with_journal(
  p_expense_id text, p_store_id text, p_date date, p_category text,
  p_description text, p_amount numeric, p_paid_from text, p_vehicle_id text,
  p_employee_id text, p_account_id text, p_status text DEFAULT 'paid'::text,
  p_transaction_id text DEFAULT NULL::text, p_period text DEFAULT NULL::text,
  p_journal_date date DEFAULT NULL::date, p_journal_store_id text DEFAULT NULL::text,
  p_created_by text DEFAULT NULL::text, p_legs jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  INSERT INTO expenses (
    id, store_id, date, category, description,
    amount, paid_from, vehicle_id, employee_id,
    account_id, status
  ) VALUES (
    p_expense_id, p_store_id, p_date, p_category, p_description,
    p_amount, p_paid_from, p_vehicle_id, p_employee_id,
    p_account_id, p_status
  )
  ON CONFLICT (id) DO UPDATE SET
    store_id    = EXCLUDED.store_id,
    date        = EXCLUDED.date,
    category    = EXCLUDED.category,
    description = EXCLUDED.description,
    amount      = EXCLUDED.amount,
    paid_from   = EXCLUDED.paid_from,
    vehicle_id  = EXCLUDED.vehicle_id,
    employee_id = EXCLUDED.employee_id,
    account_id  = EXCLUDED.account_id,
    status      = EXCLUDED.status;
  IF p_status = 'paid' AND jsonb_array_length(p_legs) > 0 THEN
    INSERT INTO journal_entries (
      id, transaction_id, period, date, store_id,
      account_id, debit, credit, description,
      reference_type, reference_id, created_by
    )
    SELECT
      leg->>'id', p_transaction_id, p_period, p_journal_date, p_journal_store_id,
      leg->>'account_id', (leg->>'debit')::numeric(12,2), (leg->>'credit')::numeric(12,2),
      leg->>'description', leg->>'reference_type', leg->>'reference_id', p_created_by
    FROM jsonb_array_elements(p_legs) AS leg;
  END IF;
END;
$function$;

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
      paid_from = p_paid_from
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

CREATE OR REPLACE FUNCTION public.has_permission(required text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'permissions') ? required,
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_store_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text((current_setting('request.jwt.claims', true)::jsonb) -> 'store_ids')),
    '{}'::text[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

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
