-- ============================================================
-- 106: cleanup_bookings_by_email_or_test RPC
--
-- Deletes all orders (and their related financial / operational
-- data) that belong to:
--   (a) customers whose email matches p_email (case-insensitive), OR
--   (b) customers whose name contains 'TEST' (case-insensitive)
--
-- Also cleans orphaned orders_raw rows (unprocessed / not yet
-- activated into an order) that match on customer_email or
-- customer_name.
--
-- The matching customers themselves are also deleted after their
-- orders are removed.
--
-- Tables cleaned (in FK-safe order):
--   waiver_reminder_log, post_rental_email_log,
--   inspections (+ inspection_results via cascade),
--   vehicle_swaps, maya_checkouts, card_settlements,
--   order_payments, payments,
--   journal_entries (order legs only),
--   waivers (matched via booking_token / order_reference),
--   orders_raw (matched via order_reference, then orphans by email/name),
--   orders (cascades → order_items, order_addons),
--   customers (the matched test customers)
--
-- Fleet reset:
--   Only the vehicles that were on those orders are reset
--   to 'available' (skips 'sold' and 'service_vehicle').
--
-- NOT touched:
--   cash_reconciliation, expenses, maintenance, payroll,
--   timesheets, booking_holds, any other real orders.
--
-- CALL ONLY via the protected /api/dev-tools/reset-by-email
-- endpoint which requires the can_edit_settings permission.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_bookings_by_email_or_test(
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result        jsonb    := '{}';
  v_n             int;
  v_customer_ids  text[];
  v_order_ids     text[];
  v_order_refs    text[];
  v_vehicle_ids   text[];
  v_raw_order_ids uuid[];
BEGIN

  -- ── 0. Resolve matching customer IDs ──────────────────────────────
  SELECT array_agg(id)
  INTO   v_customer_ids
  FROM   public.customers
  WHERE  (p_email IS NOT NULL AND email ILIKE p_email)
     OR  name ILIKE '%TEST%';

  v_result := v_result || jsonb_build_object(
    'matched_customers', coalesce(array_length(v_customer_ids, 1), 0)
  );

  -- ── ACTIVATED ORDERS ──────────────────────────────────────────────
  IF v_customer_ids IS NOT NULL AND array_length(v_customer_ids, 1) > 0 THEN

    SELECT array_agg(o.id)
    INTO   v_order_ids
    FROM   public.orders o
    WHERE  o.customer_id = ANY(v_customer_ids);

    v_result := v_result || jsonb_build_object(
      'matched_orders', coalesce(array_length(v_order_ids, 1), 0)
    );

    IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN

      -- Collect vehicle IDs before order_items are cascade-deleted
      SELECT array_agg(DISTINCT oi.vehicle_id)
      INTO   v_vehicle_ids
      FROM   public.order_items oi
      WHERE  oi.order_id = ANY(v_order_ids)
        AND  oi.vehicle_id IS NOT NULL;

      -- Collect booking tokens (used as order_reference in waivers / orders_raw)
      SELECT array_agg(o.booking_token)
      INTO   v_order_refs
      FROM   public.orders o
      WHERE  o.id = ANY(v_order_ids)
        AND  o.booking_token IS NOT NULL;

      -- 1. Log tables
      DELETE FROM public.waiver_reminder_log
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('waiver_reminder_log', v_n);

      DELETE FROM public.post_rental_email_log
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('post_rental_email_log', v_n);

      -- 2. Inspections (inspection_results cascade-deletes)
      DELETE FROM public.inspections
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('inspections', v_n);

      -- 3. Vehicle swaps
      DELETE FROM public.vehicle_swaps
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('vehicle_swaps', v_n);

      -- 4. Maya checkouts
      DELETE FROM public.maya_checkouts
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('maya_checkouts', v_n);

      -- 5. Card settlements
      DELETE FROM public.card_settlements
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('card_settlements', v_n);

      -- 7. Payments
      DELETE FROM public.payments
      WHERE  order_id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('payments', v_n);

      -- 8. Journal entries (only legs tied to these orders)
      DELETE FROM public.journal_entries
      WHERE  reference_type = 'order'
        AND  reference_id   = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('journal_entries', v_n);

      -- 9. Waivers (keyed by order_reference = booking_token)
      IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
        DELETE FROM public.waivers
        WHERE  order_reference = ANY(v_order_refs);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSE
        v_n := 0;
      END IF;
      v_result := v_result || jsonb_build_object('waivers', v_n);

      -- 10. Raw orders matched by order_reference
      IF v_order_refs IS NOT NULL AND array_length(v_order_refs, 1) > 0 THEN
        DELETE FROM public.orders_raw
        WHERE  order_reference = ANY(v_order_refs);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSE
        v_n := 0;
      END IF;
      v_result := v_result || jsonb_build_object('orders_raw_by_ref', v_n);

      -- 11. Orders (cascades → order_items, order_addons)
      DELETE FROM public.orders
      WHERE  id = ANY(v_order_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_result := v_result || jsonb_build_object('orders', v_n);

      -- 12. Fleet status reset (only affected vehicles)
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

    END IF; -- end v_order_ids block

    -- 13. Delete the test customers themselves (orders are gone now)
    DELETE FROM public.customers
    WHERE  id = ANY(v_customer_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customers_deleted', v_n);

  END IF; -- end v_customer_ids block

  -- ── ORPHANED RAW ORDERS ───────────────────────────────────────────
  -- Handle orders_raw rows that were never activated (no matching order),
  -- matched by customer_email or customer_name.

  SELECT array_agg(r.id)
  INTO   v_raw_order_ids
  FROM   public.orders_raw r
  WHERE  (p_email IS NOT NULL AND r.customer_email ILIKE p_email)
     OR  r.customer_name ILIKE '%TEST%';

  IF v_raw_order_ids IS NOT NULL AND array_length(v_raw_order_ids, 1) > 0 THEN

    -- Waivers for orphaned raw orders (via order_reference)
    DELETE FROM public.waivers w
    WHERE EXISTS (
      SELECT 1
      FROM   public.orders_raw r
      WHERE  r.id = ANY(v_raw_order_ids)
        AND  r.order_reference IS NOT NULL
        AND  r.order_reference = w.order_reference
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('waivers_raw', v_n);

    -- The orphaned raw orders themselves
    DELETE FROM public.orders_raw
    WHERE  id = ANY(v_raw_order_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('orders_raw_orphaned', v_n);

  ELSE
    v_result := v_result || jsonb_build_object('orders_raw_orphaned', 0);
  END IF;

  RETURN v_result;

END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_bookings_by_email_or_test(text) TO authenticated;
