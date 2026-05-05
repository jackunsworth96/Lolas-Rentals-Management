-- ============================================================
-- Timesheet amendment audit log
-- Records a full before/after snapshot every time an authorised
-- user amends a Pending timesheet, so there is a traceable
-- history of all manual corrections.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.timesheet_amendment_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id    text NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  amended_by      uuid NOT NULL REFERENCES public.users(id),
  amended_at      timestamptz NOT NULL DEFAULT now(),
  before_values   jsonb NOT NULL,
  after_values    jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amendment_logs_timesheet
  ON public.timesheet_amendment_logs (timesheet_id, amended_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.timesheet_amendment_logs ENABLE ROW LEVEL SECURITY;

-- Editors can insert log rows (the API uses service-role, so this is
-- a defence-in-depth check rather than a practical gate).
DROP POLICY IF EXISTS amendment_logs_insert ON public.timesheet_amendment_logs;
CREATE POLICY amendment_logs_insert
  ON public.timesheet_amendment_logs
  FOR INSERT
  WITH CHECK (public.has_permission('can_edit_timesheets'));

-- Anyone who can view timesheets can read the audit log.
DROP POLICY IF EXISTS amendment_logs_select ON public.timesheet_amendment_logs;
CREATE POLICY amendment_logs_select
  ON public.timesheet_amendment_logs
  FOR SELECT
  USING (public.has_permission('can_view_timesheets'));
