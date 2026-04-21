-- ============================================================
-- 094: reset_test_data RPC
--
-- Wipes all operational / booking test data in a single
-- atomic transaction and resets fleet statuses.
--
-- Preserved (never touched):
--   stores, employees, users, roles, role_permissions,
--   vehicle_models, fleet (status reset only), chart_of_accounts,
--   addons, locations, fleet_statuses, inspection_items,
--   payment_methods, recurring_bills, reviews, merchandise,
--   directory, paw_card_entries, customers, expenses,
--   maintenance, timesheets, payroll_runs, budget_periods,
--   budget_lines, todo_tasks / todo_comments
--
-- Wiped:
--   waiver_reminder_log, post_rental_email_log,
--   inspections (+ inspection_results via cascade),
--   vehicle_swaps, maya_checkouts, card_settlements,
--   order_payments, payments, journal_entries, transfers,
--   orders (+ order_items / order_addons via cascade),
--   orders_raw, waivers, booking_holds,
--   cash_reconciliation, lost_opportunity
--
-- Fleet reset:
--   status → 'available' for all except 'sold' and
--   'service_vehicle'.
--
-- CALL ONLY via the protected /api/dev-tools/reset endpoint
-- which requires the can_edit_settings permission.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_test_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}';
  v_n      int;
BEGIN

  -- ── 1. Log tables referencing orders (no cascade) ────────
  DELETE FROM public.waiver_reminder_log;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

  DELETE FROM public.post_rental_email_log;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

  -- ── 2. Inspections (inspection_results cascades) ─────────
  DELETE FROM public.inspections;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inspections', v_n);

  -- ── 3. Vehicle swaps ──────────────────────────────────────
  DELETE FROM public.vehicle_swaps;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

  -- ── 4. Maya checkouts ────────────────────────────────────
  DELETE FROM public.maya_checkouts;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

  -- ── 5. Card settlements ───────────────────────────────────
  DELETE FROM public.card_settlements;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('card_settlements', v_n);

  -- ── 6. Order payments (pre-activation payments on raw orders)
  DELETE FROM public.order_payments;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_payments', v_n);

  -- ── 7. Payments (includes extensions stored as payment rows)
  DELETE FROM public.payments;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payments', v_n);

  -- ── 8. Journal entries (no FK to orders; wipe all) ───────
  DELETE FROM public.journal_entries;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('journal_entries', v_n);

  -- ── 9. Transfers (order_id is plain text, no FK constraint)
  DELETE FROM public.transfers;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('transfers', v_n);

  -- ── 10. Orders (cascades → order_items, order_addons) ────
  DELETE FROM public.orders;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_n);

  -- ── 11. Raw orders (inbox) ────────────────────────────────
  DELETE FROM public.orders_raw;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders_raw', v_n);

  -- ── 12. Waivers (text reference to order_reference) ──────
  DELETE FROM public.waivers;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waivers', v_n);

  -- ── 13. Booking holds ─────────────────────────────────────
  DELETE FROM public.booking_holds;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('booking_holds', v_n);

  -- ── 14. Cash reconciliation (cashup records) ──────────────
  DELETE FROM public.cash_reconciliation;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_reconciliation', v_n);

  -- ── 15. Lost opportunity ──────────────────────────────────
  DELETE FROM public.lost_opportunity;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lost_opportunity', v_n);

  -- ── 16. Fleet status reset ────────────────────────────────
  -- Reset all vehicles back to 'available' except those that
  -- are permanently sold or designated service vehicles.
  UPDATE public.fleet
  SET    status     = 'available',
         updated_at = now()
  WHERE  status NOT IN ('sold', 'service_vehicle');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('fleet_reset', v_n);

  RETURN v_result;

END;
$$;

-- Grant execute to authenticated users so the API (service role)
-- can call it. Actual permission gating happens at the API layer
-- via the can_edit_settings role permission check.
GRANT EXECUTE ON FUNCTION public.reset_test_data() TO authenticated;
