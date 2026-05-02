-- ============================================================
-- 130: Accommodation Partners v2
-- Adds rental_value_raw to orders_raw (pure rental subtotal,
-- no addons/fees/charity/card surcharge), adds telegram_chat_id
-- and commission_includes_extensions to accommodation_partners,
-- and updates the commission attribution view accordingly.
-- ============================================================

-- ─── New column on orders_raw ─────────────────────────────────────────────
-- Stores the pure rental subtotal (rental_days × daily_rate) at booking time.
-- Used as the commission base so addons, charity, card fees, and transfers
-- are excluded from commission calculations.

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS rental_value_raw numeric(12,2);

-- ─── New columns on accommodation_partners ───────────────────────────────

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS commission_includes_extensions boolean NOT NULL DEFAULT false;

-- ─── Rebuild the attribution view ────────────────────────────────────────
-- Uses rental_value_raw as the commission base for percentage commissions.
-- For fixed commissions the base value is irrelevant (flat fee per booking).
-- When commission_includes_extensions = false (default): commission is on the
-- original rental value only (rental_value_raw).
-- When commission_includes_extensions = true: for activated orders we use
-- orders.final_total (which includes any extension revenue after activation);
-- for unprocessed orders we fall back to rental_value_raw.

DROP VIEW IF EXISTS public.partner_booking_attribution;

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
  or_raw.rental_value_raw,
  to_char(
    DATE_TRUNC('month', or_raw.created_at AT TIME ZONE 'Asia/Manila'),
    'YYYY-MM'
  )                        AS booking_month,
  ap.id                    AS partner_id,
  ap.name                  AS partner_name,
  ap.commission_type,
  ap.commission_value,
  ap.advance_booking_days,
  ap.commission_includes_extensions,
  ap.active                AS partner_active,
  ap.telegram_chat_id,

  -- Commission base:
  -- Fixed type: flat fee, base_value doesn't matter for calculation.
  -- Percentage: use rental_value_raw (original rental only) unless
  -- commission_includes_extensions = true, in which case we try to pull
  -- the activated order's final_total (minus security deposit) instead.
  CASE
    WHEN ap.commission_type = 'fixed' THEN NULL
    WHEN ap.commission_includes_extensions THEN
      COALESCE(
        (SELECT o.final_total - o.security_deposit
           FROM public.orders o
          WHERE o.partner_ref = or_raw.partner_ref
            AND o.store_id = or_raw.store_id
            AND or_raw.status = 'processed'
          ORDER BY o.created_at DESC
          LIMIT 1),
        or_raw.rental_value_raw,
        or_raw.web_quote_raw
      )
    ELSE
      COALESCE(or_raw.rental_value_raw, or_raw.web_quote_raw)
  END AS commission_base,

  -- Commissionable: not cancelled + pickup at least advance_booking_days after booking
  CASE
    WHEN or_raw.status = 'cancelled'       THEN false
    WHEN or_raw.pickup_datetime IS NULL     THEN false
    WHEN EXTRACT(EPOCH FROM (
           or_raw.pickup_datetime::timestamptz - or_raw.created_at
         )) / 86400.0 >= ap.advance_booking_days THEN true
    ELSE false
  END AS is_commissionable,

  -- Commission amount
  CASE
    WHEN or_raw.status = 'cancelled'   THEN 0
    WHEN or_raw.pickup_datetime IS NULL THEN 0
    WHEN EXTRACT(EPOCH FROM (
           or_raw.pickup_datetime::timestamptz - or_raw.created_at
         )) / 86400.0 >= ap.advance_booking_days THEN
      CASE ap.commission_type
        WHEN 'percentage' THEN
          ROUND(
            COALESCE(
              CASE
                WHEN ap.commission_includes_extensions THEN
                  COALESCE(
                    (SELECT o.final_total - o.security_deposit
                       FROM public.orders o
                      WHERE o.partner_ref = or_raw.partner_ref
                        AND o.store_id = or_raw.store_id
                        AND or_raw.status = 'processed'
                      ORDER BY o.created_at DESC
                      LIMIT 1),
                    or_raw.rental_value_raw,
                    or_raw.web_quote_raw
                  )
                ELSE
                  COALESCE(or_raw.rental_value_raw, or_raw.web_quote_raw)
              END,
              0
            ) * ap.commission_value / 100,
            2
          )
        ELSE ap.commission_value
      END
    ELSE 0
  END AS commission_amount
FROM public.orders_raw or_raw
JOIN public.accommodation_partners ap
  ON ap.slug      = or_raw.partner_ref
  AND ap.store_id = or_raw.store_id
WHERE or_raw.partner_ref IS NOT NULL;
