-- ============================================================
-- 070: Enable RLS on late_return_assignments
-- Migration 066 added policies but forgot to enable RLS on the table.
-- ============================================================
ALTER TABLE public.late_return_assignments ENABLE ROW LEVEL SECURITY;
