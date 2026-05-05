-- ============================================================
-- Add can_edit_timesheets permission and a dedicated UPDATE
-- policy so that authorised users (Jack, Nitz) can amend
-- Pending timesheets without touching the existing submit/approve
-- policies.
-- ============================================================

-- ── RLS: allow UPDATE of Pending timesheets for editors ──────────────────────
-- The existing ts_modify policy covers INSERT (submit) and uses
-- can_submit_timesheets.  We add a separate UPDATE-only policy that
-- requires the new can_edit_timesheets permission and also enforces
-- that only Pending rows may be changed (Approved and Paid are locked).

DROP POLICY IF EXISTS ts_edit ON timesheets;

CREATE POLICY ts_edit ON timesheets
  FOR UPDATE
  USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_timesheets')
    AND payroll_status = 'Pending'
  )
  WITH CHECK (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_timesheets')
    AND payroll_status = 'Pending'
  );
