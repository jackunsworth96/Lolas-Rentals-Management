-- Keep the name entered for a booking separate from the mutable customer
-- profile. Multiple bookings can legitimately share contact details while
-- having different renter/driver labels.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS booking_customer_name text;

COMMENT ON COLUMN public.orders.booking_customer_name IS
  'Snapshot of the customer/renter name entered for this booking at activation time.';

-- Repair existing activated orders from their original raw booking. Fall back
-- to the current customer profile where the raw booking is unavailable.
UPDATE public.orders AS o
SET booking_customer_name = COALESCE(
  (
    SELECT NULLIF(btrim(r.customer_name), '')
    FROM public.orders_raw AS r
    WHERE r.order_reference = o.booking_token
    ORDER BY r.created_at DESC
    LIMIT 1
  ),
  (
    SELECT NULLIF(btrim(c.name), '')
    FROM public.customers AS c
    WHERE c.id = o.customer_id
  )
)
WHERE o.booking_customer_name IS NULL;

-- Activation RPCs insert the customer before the order, so a trigger can
-- capture the booking-specific name atomically without changing every RPC
-- signature. Explicit values remain untouched.
CREATE OR REPLACE FUNCTION public.snapshot_order_booking_customer_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(NEW.booking_customer_name), '') IS NULL THEN
    SELECT NULLIF(btrim(r.customer_name), '')
    INTO NEW.booking_customer_name
    FROM public.orders_raw AS r
    WHERE r.order_reference = NEW.booking_token
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF NEW.booking_customer_name IS NULL THEN
      SELECT NULLIF(btrim(c.name), '')
      INTO NEW.booking_customer_name
      FROM public.customers AS c
      WHERE c.id = NEW.customer_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_order_booking_customer_name
  ON public.orders;

CREATE TRIGGER trg_snapshot_order_booking_customer_name
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_order_booking_customer_name();
