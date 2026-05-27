-- ============================================================
-- 144: Enable RLS on booking_sessions and helmet_swaps
--
-- These two tables were created without RLS, making them
-- publicly accessible via the Data API with the anon key.
-- booking_sessions also contains sensitive renter_details
-- (customer name, email, phone) in a JSONB column.
--
-- All writes to both tables go through the API server using
-- the service role key (which bypasses RLS), so these
-- policies have no impact on existing functionality.
-- ============================================================

-- ─── booking_sessions ──────────────────────────────────────
-- Funnel tracking table. Contains renter_details JSON with
-- customer PII (name, email, phone, nationality).
-- Staff can read sessions for their own store(s).
-- No direct-write policy: all inserts/updates use service role.

ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_sessions_select ON public.booking_sessions
  FOR SELECT USING (store_id = ANY(public.user_store_ids()));

-- ─── helmet_swaps ──────────────────────────────────────────
-- Operational log of helmet swaps per order.
-- Scoped to the store the order belongs to.

ALTER TABLE public.helmet_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY helmet_swaps_select ON public.helmet_swaps
  FOR SELECT USING (store_id = ANY(public.user_store_ids()));

CREATE POLICY helmet_swaps_modify ON public.helmet_swaps
  FOR ALL USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_orders')
  );
