-- ============================================================
-- Fix orphaned extension payment records for three Bravo bookings
-- (LR-0720-2C2D, LR-0720-0BF3, LR-0720-03B8) that were extended
-- via the staff backoffice before the routing bug was fixed.
--
-- The old bug called the raw-order extension path for active bookings,
-- which wrote extension payments linked to raw_order_id instead of
-- order_id. As a result:
--   - payments.order_id was NULL (orphaned from the active order)
--   - order_items.dropoff_datetime was not updated on some bookings
--
-- This script:
--   1. Re-links orphaned extension payments to the correct order_id
--      and order_item_id, clearing raw_order_id.
--   2. Updates order_items.dropoff_datetime / rental_days_count to
--      Jul 28 2026 11:15 AM +08:00 where not already at that date.
--
-- orders.final_total and balance_due are intentionally not touched:
-- the orders API fallback (MAX(final_total - paid, pendingExtensions))
-- computes the correct balance once the payment rows are re-linked.
-- ============================================================

DO $$
DECLARE
  v_refs       text[]      := ARRAY['LR-0720-2C2D', 'LR-0720-0BF3', 'LR-0720-03B8'];
  v_ref        text;
  v_order_id   text;
  v_raw_id     text;
  v_item_id    text;
  v_pickup     timestamptz;
  v_dropoff    timestamptz;
  v_new_dropoff timestamptz := '2026-07-28 11:15:00+08';
  v_new_days   integer;
  v_pmts       integer;
BEGIN
  FOREACH v_ref IN ARRAY v_refs
  LOOP
    -- ── 1. Locate the active order ──────────────────────────────
    SELECT id INTO v_order_id
    FROM orders
    WHERE booking_token = v_ref
    LIMIT 1;

    IF v_order_id IS NULL THEN
      RAISE NOTICE '[fix-ext] % — active order not found, skipping', v_ref;
      CONTINUE;
    END IF;

    -- ── 2. Locate the raw order (source of orphaned payments) ───
    SELECT id INTO v_raw_id
    FROM orders_raw
    WHERE order_reference = v_ref
    LIMIT 1;

    -- ── 3. Re-link orphaned extension payments ──────────────────
    -- Only touches payments that have raw_order_id set and order_id
    -- still NULL (i.e. not already fixed by a previous run).
    IF v_raw_id IS NOT NULL THEN
      -- Temporarily get the order item id for the FK
      SELECT id INTO v_item_id
      FROM order_items
      WHERE order_id = v_order_id
      LIMIT 1;

      UPDATE payments
      SET
        order_id      = v_order_id,
        raw_order_id  = NULL,
        order_item_id = v_item_id
      WHERE raw_order_id = v_raw_id
        AND payment_type  = 'extension'
        AND order_id IS NULL;

      GET DIAGNOSTICS v_pmts = ROW_COUNT;
      RAISE NOTICE '[fix-ext] % — re-linked % extension payment(s) to order %',
        v_ref, v_pmts, v_order_id;
    ELSE
      RAISE NOTICE '[fix-ext] % — raw order not found, skipping payment re-link', v_ref;
    END IF;

    -- ── 4. Fix order_items dropoff date if not already extended ─
    SELECT id, pickup_datetime, dropoff_datetime
    INTO v_item_id, v_pickup, v_dropoff
    FROM order_items
    WHERE order_id = v_order_id
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RAISE NOTICE '[fix-ext] % — order item not found, skipping date update', v_ref;
      CONTINUE;
    END IF;

    IF v_dropoff >= v_new_dropoff THEN
      RAISE NOTICE '[fix-ext] % — dropoff already at or after Jul 28, no date update needed', v_ref;
      CONTINUE;
    END IF;

    v_new_days := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_new_dropoff - v_pickup)) / 86400.0)::integer
    );

    UPDATE order_items
    SET
      dropoff_datetime  = v_new_dropoff,
      rental_days_count = v_new_days
    WHERE id = v_item_id;

    RAISE NOTICE '[fix-ext] % — updated dropoff to % (%  days)',
      v_ref, v_new_dropoff, v_new_days;

  END LOOP;
END $$;
