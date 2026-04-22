-- ============================================================
-- 095: fix reset_test_data() for pg_safeupdate
--
-- pg_safeupdate rejects DELETE statements that have no WHERE
-- clause. Adding WHERE true satisfies the extension without
-- changing which rows are deleted (still all of them).
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
  DELETE FROM public.waiver_reminder_log   WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

  DELETE FROM public.post_rental_email_log WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

  -- ── 2. Inspections (inspection_results cascades) ─────────
  DELETE FROM public.inspections           WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inspections', v_n);

  -- ── 3. Vehicle swaps ──────────────────────────────────────
  DELETE FROM public.vehicle_swaps         WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

  -- ── 4. Maya checkouts ────────────────────────────────────
  DELETE FROM public.maya_checkouts        WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

  -- ── 5. Card settlements ───────────────────────────────────
  DELETE FROM public.card_settlements      WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('card_settlements', v_n);

  -- ── 7. Payments (includes extensions stored as payment rows)
  DELETE FROM public.payments              WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payments', v_n);

  -- ── 8. Journal entries (no FK to orders; wipe all) ───────
  DELETE FROM public.journal_entries       WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('journal_entries', v_n);

  -- ── 9. Transfers (order_id is plain text, no FK constraint)
  DELETE FROM public.transfers             WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('transfers', v_n);

  -- ── 10. Orders (cascades → order_items, order_addons) ────
  DELETE FROM public.orders                WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_n);

  -- ── 11. Raw orders (inbox) ────────────────────────────────
  DELETE FROM public.orders_raw            WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders_raw', v_n);

  -- ── 12. Waivers (text reference to order_reference) ──────
  DELETE FROM public.waivers               WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waivers', v_n);

  -- ── 13. Booking holds ─────────────────────────────────────
  DELETE FROM public.booking_holds         WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('booking_holds', v_n);

  -- ── 14. Cash reconciliation (cashup records) ──────────────
  DELETE FROM public.cash_reconciliation   WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_reconciliation', v_n);

  -- ── 15. Lost opportunity ──────────────────────────────────
  DELETE FROM public.lost_opportunity      WHERE true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lost_opportunity', v_n);

  -- ── 16. Fleet status reset ────────────────────────────────
  UPDATE public.fleet
  SET    status     = 'available',
         updated_at = now()
  WHERE  status NOT IN ('sold', 'service_vehicle');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('fleet_reset', v_n);

  RETURN v_result;

END;
$$;
