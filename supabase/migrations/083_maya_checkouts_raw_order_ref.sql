-- ============================================================
-- 083_maya_checkouts_raw_order_ref.sql
-- Allow Maya checkouts to link to orders_raw for pre-activation
-- payments (AC-08). A checkout must reference exactly one of
-- orders.id or orders_raw.id; the webhook handler uses the
-- populated link to route the payment to the right target.
-- ============================================================

-- 1. Make order_id nullable so checkouts for unactivated bookings
--    can be stored without a canonical order row yet.
ALTER TABLE public.maya_checkouts
  ALTER COLUMN order_id DROP NOT NULL;

-- 2. Add raw_order_id linking the checkout to the orders_raw row
--    that will (eventually) be activated. ON DELETE SET NULL so a
--    cancelled raw order does not cascade-delete paid checkouts —
--    they remain in place as audit records.
ALTER TABLE public.maya_checkouts
  ADD COLUMN IF NOT EXISTS raw_order_id uuid
    REFERENCES public.orders_raw(id) ON DELETE SET NULL;

-- 3. Exactly one of order_id / raw_order_id must be set. This
--    prevents orphaned checkouts and ambiguous routing in the
--    webhook handler.
ALTER TABLE public.maya_checkouts
  DROP CONSTRAINT IF EXISTS maya_checkouts_exactly_one_order_link;

ALTER TABLE public.maya_checkouts
  ADD CONSTRAINT maya_checkouts_exactly_one_order_link
  CHECK (
    (order_id IS NOT NULL AND raw_order_id IS NULL)
    OR
    (order_id IS NULL AND raw_order_id IS NOT NULL)
  );

-- 4. Lookup index for the raw-order path in the webhook handler.
CREATE INDEX IF NOT EXISTS idx_maya_checkouts_raw_order_id
  ON public.maya_checkouts(raw_order_id)
  WHERE raw_order_id IS NOT NULL;
