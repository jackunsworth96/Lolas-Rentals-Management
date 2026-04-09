-- ============================================================
-- 058: Enable RLS on missing tables + revoke SECURITY DEFINER
--      functions from anon + storage bucket note
-- ============================================================

-- ── payment_routing_rules ──
ALTER TABLE payment_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_routing_rules_select
  ON payment_routing_rules FOR SELECT
  USING (public.has_permission('can_edit_settings'));
CREATE POLICY payment_routing_rules_modify
  ON payment_routing_rules FOR ALL
  USING (public.has_permission('can_edit_settings'));

-- ── booking_holds ──
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_holds_select
  ON booking_holds FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY booking_holds_insert
  ON booking_holds FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY booking_holds_delete
  ON booking_holds FOR DELETE
  USING (auth.role() = 'authenticated');

-- ── task_categories ──
ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_categories_select
  ON task_categories FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY task_categories_modify
  ON task_categories FOR ALL
  USING (public.has_permission('can_edit_settings'));

-- ── task_events ──
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_events_select
  ON task_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── task_notifications ──
ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_notifications_select
  ON task_notifications FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── repair_costs ──
ALTER TABLE repair_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY repair_costs_select
  ON repair_costs FOR SELECT
  USING (true);
CREATE POLICY repair_costs_modify
  ON repair_costs FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- M5: Revoke SECURITY DEFINER functions from anon
-- ============================================================
REVOKE EXECUTE ON FUNCTION cancel_order_raw_atomic FROM anon;
REVOKE EXECUTE ON FUNCTION confirm_extend_raw_atomic FROM anon;
REVOKE EXECUTE ON FUNCTION confirm_extend_order_atomic FROM anon;

-- ============================================================
-- L6: Storage bucket — paw-card-receipts
-- ============================================================
-- The paw-card-receipts storage bucket needs these policies
-- set manually in Supabase Dashboard → Storage → paw-card-receipts → Policies:
--   INSERT: authenticated users only (auth.role() = 'authenticated')
--   SELECT: public (anyone can view receipts)
-- SQL storage policies cannot be set via migration; apply via dashboard.
