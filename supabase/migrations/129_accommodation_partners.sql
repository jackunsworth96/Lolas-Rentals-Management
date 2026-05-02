-- ============================================================
-- 129: Accommodation Partners (affiliate/referral system)
-- Creates the accommodation_partners table, adds partner_ref
-- columns to orders_raw and orders, and creates a view for
-- commission summary calculations.
-- ============================================================

-- ─── Table ──────────────────────────────────────────────────

CREATE TABLE public.accommodation_partners (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             text NOT NULL REFERENCES public.stores(id),
  name                 text NOT NULL,
  slug                 text NOT NULL,
  contact_name         text,
  contact_email        text,
  contact_whatsapp     text,
  commission_type      text NOT NULL DEFAULT 'fixed'
                         CHECK (commission_type IN ('fixed', 'percentage')),
  commission_value     numeric(10,2) NOT NULL DEFAULT 0,
  advance_booking_days integer NOT NULL DEFAULT 7,
  active               boolean NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

-- ─── partner_ref on raw and activated orders ──────────────────

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS partner_ref text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_ref text;

-- ─── Index for fast lookups ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_raw_partner_ref ON public.orders_raw(partner_ref)
  WHERE partner_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_partner_ref ON public.orders(partner_ref)
  WHERE partner_ref IS NOT NULL;

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.accommodation_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY accommodation_partners_select ON public.accommodation_partners
  FOR SELECT USING (store_id = ANY(public.user_store_ids()));

CREATE POLICY accommodation_partners_modify ON public.accommodation_partners
  FOR ALL USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_settings')
  );

-- ─── Commission attribution view ─────────────────────────────
-- Uses orders_raw as the source of truth for partner attribution:
-- - partner_ref links to accommodation_partners.slug
-- - booking eligibility = pickup_datetime at least advance_booking_days
--   after orders_raw.created_at
-- - web_quote_raw is the booking value (stored at submission time)
-- - commission is only calculated for non-cancelled rows

CREATE OR REPLACE VIEW public.partner_booking_attribution AS
SELECT
  or_raw.id                AS raw_order_id,
  or_raw.order_reference,
  or_raw.store_id,
  or_raw.partner_ref,
  or_raw.status            AS raw_status,
  or_raw.created_at        AS booked_at,
  or_raw.pickup_datetime,
  or_raw.dropoff_datetime,
  or_raw.customer_name,
  or_raw.web_quote_raw,
  to_char(
    DATE_TRUNC('month', or_raw.created_at AT TIME ZONE 'Asia/Manila'),
    'YYYY-MM'
  )                        AS booking_month,
  ap.id                    AS partner_id,
  ap.name                  AS partner_name,
  ap.commission_type,
  ap.commission_value,
  ap.advance_booking_days,
  ap.active                AS partner_active,
  -- Commissionable when not cancelled and booked advance_booking_days ahead
  CASE
    WHEN or_raw.status = 'cancelled'       THEN false
    WHEN or_raw.pickup_datetime IS NULL     THEN false
    WHEN EXTRACT(EPOCH FROM (
           or_raw.pickup_datetime::timestamptz - or_raw.created_at
         )) / 86400.0 >= ap.advance_booking_days THEN true
    ELSE false
  END AS is_commissionable,
  -- Commission amount (only when commissionable)
  CASE
    WHEN or_raw.status = 'cancelled'   THEN 0
    WHEN or_raw.pickup_datetime IS NULL THEN 0
    WHEN EXTRACT(EPOCH FROM (
           or_raw.pickup_datetime::timestamptz - or_raw.created_at
         )) / 86400.0 >= ap.advance_booking_days THEN
      CASE ap.commission_type
        WHEN 'percentage' THEN
          ROUND(COALESCE(or_raw.web_quote_raw, 0) * ap.commission_value / 100, 2)
        ELSE ap.commission_value
      END
    ELSE 0
  END AS commission_amount
FROM public.orders_raw or_raw
JOIN public.accommodation_partners ap
  ON ap.slug      = or_raw.partner_ref
  AND ap.store_id = or_raw.store_id
WHERE or_raw.partner_ref IS NOT NULL;
