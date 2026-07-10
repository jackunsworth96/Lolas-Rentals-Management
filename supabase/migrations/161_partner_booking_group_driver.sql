-- Track partner portal multi-vehicle booking groups and per-vehicle driver names.

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS partner_booking_group_ref text NULL,
  ADD COLUMN IF NOT EXISTS driver_name text NULL;

CREATE INDEX IF NOT EXISTS idx_orders_raw_partner_booking_group_ref
  ON public.orders_raw(partner_booking_group_ref)
  WHERE partner_booking_group_ref IS NOT NULL;
