-- ============================================================
-- 100: cleanup_test_customer_orders RPC
--
-- Deletes all orders (and their related financial / operational
-- data) that belong to a customer whose name exactly matches
-- p_customer_name.  Everything else (other customers, real
-- orders, cashup records, etc.) is left completely untouched.
--
-- Tables cleaned (in FK-safe order):
--   waiver_reminder_log, post_rental_email_log,
--   inspections (+ inspection_results via cascade),
--   vehicle_swaps, maya_checkouts, card_settlements,
--   payments, journal_entries (order legs only),
--   waivers (matched via booking_token / order_reference),
--   orders_raw (matched via order_reference),
--   orders (cascades → order_items, order_addons)
--
-- Fleet reset:
--   Only the vehicles that were on those orders are reset
--   to 'available' (skips 'sold' and 'service_vehicle').
--
-- NOT touched:
--   customers, cash_reconciliation, expenses, maintenance,
--   payroll, timesheets, any other orders, booking_holds,
--   journal_entries unrelated to the matched orders.
--
-- CALL ONLY via the protected /api/dev-tools/reset-customer
-- endpoint which requires the can_edit_settings permission.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_test_customer_orders(
  p_customer_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result     jsonb := '{}';
  v_n          int;
  v_order_ids  text[];
  v_vehicle_ids text[];
  v_order_refs  text[];
BEGIN

  -- ── 0. Resolve order IDs for the target customer name ────────
  SELECT array_agg(o.id)
  INTO   v_order_ids
  FROM   public.orders o
  JOIN   public.customers c ON c.id = o.customer_id
  WHERE  c.name = p_customer_name;

  -- Nothing to do — return early with a clear message.
  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'matched_orders', 0,
      'message', 'No orders found for customer: ' || p_customer_name
    );
  END IF;

  v_result := v_result || jsonb_build_object('matched_orders', array_length(v_order_ids, 1));

  -- ── 0a. Collect vehicle IDs before we delete order_items ─────
  SELECT array_agg(DISTINCT oi.vehicle_id)
  INTO   v_vehicle_ids
  FROM   public.order_items oi
  WHERE  oi.order_id = ANY(v_order_ids)
    AND  oi.vehicle_id IS NOT NULL;

  -- ── 0b. Collect booking tokens (= order_reference in waivers /
  --        orders_raw) before we delete orders ──────────────────
  SELECT array_agg(o.booking_token)
  INTO   v_order_refs
  FROM   public.orders o
  WHERE  o.id = ANY(v_order_ids)
    AND  o.booking_token IS NOT NULL;

  -- ── 1. Log tables keyed by order_id ──────────────────────────
  DELETE FROM public.waiver_reminder_log
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

  DELETE FROM public.post_rental_email_log
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

  -- ── 2. Inspections (inspection_results cascade-deletes) ──────
  DELETE FROM public.inspections
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inspections', v_n);

  -- ── 3. Vehicle swaps ──────────────────────────────────────────
  DELETE FROM public.vehicle_swaps
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

  -- ── 4. Maya checkouts (ON DELETE CASCADE from orders, but
  --        delete explicitly so the count is captured) ─────────
  DELETE FROM public.maya_checkouts
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

  -- ── 5. Card settlements ───────────────────────────────────────
  DELETE FROM public.card_settlements
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('card_settlements', v_n);

  -- ── 6. Payments ───────────────────────────────────────────────
  DELETE FROM public.payments
  WHERE  order_id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('payments', v_n);

  -- ── 7. Journal entries (only legs tied to these orders) ──────
  DELETE FROM public.journal_entries
  WHERE  reference_type = 'order'
    AND  reference_id   = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('journal_entries', v_n);

  -- ── 8. Waivers (keyed by order_reference = booking_token) ────
  IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
    DELETE FROM public.waivers
    WHERE  order_reference = ANY(v_order_refs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('waivers', v_n);

  -- ── 9. Raw orders (order_reference text column) ───────────────
  IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
    DELETE FROM public.orders_raw
    WHERE  order_reference = ANY(v_order_refs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('orders_raw', v_n);

  -- ── 10. Orders (cascades → order_items, order_addons) ────────
  DELETE FROM public.orders
  WHERE  id = ANY(v_order_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_n);

  -- ── 11. Fleet status reset (only affected vehicles) ──────────
  IF v_vehicle_ids IS NOT NULL AND array_length(v_vehicle_ids, 1) > 0 THEN
    UPDATE public.fleet
    SET    status     = 'available',
           updated_at = now()
    WHERE  id = ANY(v_vehicle_ids)
      AND  status NOT IN ('sold', 'service_vehicle');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_result := v_result || jsonb_build_object('fleet_reset', v_n);

  RETURN v_result;

END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_test_customer_orders(text) TO authenticated;
