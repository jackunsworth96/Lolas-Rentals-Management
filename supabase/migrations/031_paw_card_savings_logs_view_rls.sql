-- Public alias for paw card rows (inserts/update target underlying table)
CREATE OR REPLACE VIEW public.savings_logs AS
SELECT * FROM public.paw_card_entries;

GRANT SELECT ON public.savings_logs TO authenticated;

-- Tighten paw card: staff API continues to use service role (bypasses RLS)
DROP POLICY IF EXISTS pawcard_all ON public.paw_card_entries;

CREATE POLICY paw_card_entries_select_authenticated
  ON public.paw_card_entries
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY paw_card_entries_insert_authenticated
  ON public.paw_card_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    email IS NOT NULL
    AND LOWER(TRIM(email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
  );

DROP POLICY IF EXISTS pawcard_est_all ON public.paw_card_establishments;

CREATE POLICY paw_card_establishments_select_authenticated
  ON public.paw_card_establishments
  FOR SELECT
  TO authenticated
  USING (is_active = true);
