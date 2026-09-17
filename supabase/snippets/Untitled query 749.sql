-- Add an auditable, atomic cancellation path for activated bookings.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text REFERENCES public.employees(id);

CREATE OR REPLACE FUNCTION public.cancel_activated_order_atomic(
  p_order_id text,
  p_cancelled_at timestamptz,
  p_cancelled_reason text,
  p_cancelled_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_order public.orders%ROWTYPE;
  customer_name text;
BEGIN
  SELECT * INTO target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF target_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;

  IF target_order.status NOT IN ('active', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not active');
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = p_cancelled_at,
      cancelled_reason = p_cancelled_reason,
      cancelled_by = p_cancelled_by,
      updated_at = now()
  WHERE id = p_order_id;

  -- Keep the archived source booking consistent for partner reporting and support lookups.
  IF target_order.booking_token IS NOT NULL THEN
    UPDATE public.orders_raw
    SET status = 'cancelled',
        cancelled_at = p_cancelled_at,
        cancelled_reason = p_cancelled_reason,
        updated_at = now()
    WHERE order_reference = target_order.booking_token;
  END IF;

  -- Release this booking's vehicles without overriding maintenance/sold states or
  -- a vehicle that is still assigned to another active/confirmed booking.
  UPDATE public.fleet AS f
  SET status = 'Available',
      updated_at = now()
  WHERE f.status = 'Active'
    AND f.id IN (
      SELECT oi.vehicle_id
      FROM public.order_items AS oi
      WHERE oi.order_id = p_order_id AND oi.vehicle_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items AS other_item
      JOIN public.orders AS other_order ON other_order.id = other_item.order_id
      WHERE other_item.vehicle_id = f.id
        AND other_order.id <> p_order_id
        AND other_order.status IN ('active', 'confirmed')
    );

  SELECT c.name INTO customer_name
  FROM public.customers AS c
  WHERE c.id = target_order.customer_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_reference', COALESCE(target_order.booking_token, target_order.woo_order_id, target_order.id),
    'customer_name', COALESCE(customer_name, '—')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_activated_order_atomic(text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_activated_order_atomic(text, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_activated_order_atomic(text, timestamptz, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_activated_order_atomic(text, timestamptz, text, text) TO service_role;
