-- ============================================================
-- 069: Fix open RLS policies on inspection_results
-- inspection_results has no store_id — scope via parent inspections table
-- ============================================================

DROP POLICY IF EXISTS inspection_results_read ON public.inspection_results;
DROP POLICY IF EXISTS inspection_results_write ON public.inspection_results;

CREATE POLICY inspection_results_read ON public.inspection_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_results.inspection_id
        AND i.store_id = ANY(public.user_store_ids())
    )
  );

CREATE POLICY inspection_results_write ON public.inspection_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_results.inspection_id
        AND i.store_id = ANY(public.user_store_ids())
    )
  );
