-- The `/orders/enriched` route (apps/api/src/routes/orders.ts) used to fetch
-- the matching orders, then run several follow-up `.in('order_id', orderIds)`
-- queries (order_items, payments, waivers, inspections, order_addons) by
-- cramming every matching order id into the request URL as a comma-separated
-- list. That list grows with the number of matching orders; once a store
-- accumulated a few hundred completed orders, the resulting request URL blew
-- past the ~16KB HTTP header limit enforced by Node/undici, the queries threw
-- UND_ERR_HEADERS_OVERFLOW, and the whole endpoint 500'd — which silently
-- rendered the Completed Orders page (and the "all orders" lookup used by
-- AccidentReportModal) as empty.
--
-- This function aggregates everything server-side in one query, keyed off
-- `store_id`/`status` instead of a per-row id list, so the request URL stays
-- small no matter how many orders match.
CREATE OR REPLACE FUNCTION public.get_enriched_orders(
  p_store_id text,
  p_statuses text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  store_id text,
  order_date date,
  customer_id text,
  booking_customer_name text,
  status text,
  final_total numeric,
  web_notes text,
  payment_method_id text,
  deposit_method_id text,
  security_deposit numeric,
  card_fee_surcharge numeric,
  woo_order_id text,
  booking_token text,
  partner_ref text,
  customer_name text,
  customer_mobile text,
  customer_email text,
  items jsonb,
  total_paid numeric,
  pending_extensions_total numeric,
  has_extension boolean,
  has_nine_pm_addon boolean,
  waiver_status text,
  waiver_signed_at timestamptz,
  inspection_status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND (p_statuses IS NULL OR o.status = ANY (p_statuses))
  ),
  items_agg AS (
    SELECT oi.order_id,
      jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'vehicle_id', oi.vehicle_id,
          'vehicle_name', oi.vehicle_name,
          'pickup_datetime', oi.pickup_datetime,
          'dropoff_datetime', oi.dropoff_datetime,
          'pickup_location_id', oi.pickup_location_id,
          'dropoff_location_id', oi.dropoff_location_id,
          'pickup_location', oi.pickup_location,
          'dropoff_location', oi.dropoff_location,
          'pickup_fee', oi.pickup_fee,
          'dropoff_fee', oi.dropoff_fee,
          'discount', oi.discount
        )
        ORDER BY oi.created_at, oi.id
      ) AS items
    FROM public.order_items oi
    JOIN base_orders bo ON bo.id = oi.order_id
    GROUP BY oi.order_id
  ),
  payments_agg AS (
    -- Mirrors the filtering previously duplicated in
    -- apps/api/src/routes/orders.ts, collect-payment.ts, refund-order.ts, and
    -- settle-order.ts:
    --  • pending/absorbed extension IOUs haven't hit cash yet (or were
    --    rolled into a settlement payment already counted elsewhere)
    --  • deposits are held against security_deposit, not final_total
    --  • pending addon IOUs (payment_method_id='pending') haven't been
    --    collected yet
    --  • refunds reduce net cash received
    SELECT p.order_id,
      SUM(
        CASE
          WHEN p.payment_type = 'extension' AND p.settlement_status IN ('pending', 'absorbed') THEN 0
          WHEN p.payment_type = 'deposit' THEN 0
          WHEN p.payment_type = 'addon' AND p.payment_method_id = 'pending' AND p.settlement_status = 'pending' THEN 0
          WHEN p.payment_type = 'refund' THEN -COALESCE(p.amount, 0)
          ELSE COALESCE(p.amount, 0)
        END
      ) AS total_paid,
      SUM(
        CASE WHEN p.payment_type = 'extension' AND p.settlement_status = 'pending' THEN COALESCE(p.amount, 0) ELSE 0 END
      ) AS pending_extensions_total,
      bool_or(p.payment_type = 'extension') AS has_extension
    FROM public.payments p
    JOIN base_orders bo ON bo.id = p.order_id
    GROUP BY p.order_id
  ),
  addons_agg AS (
    SELECT oa.order_id,
      bool_or(
        lower(oa.addon_name) LIKE '%9pm%'
        OR lower(oa.addon_name) LIKE '%21:00%'
        OR lower(oa.addon_name) LIKE '%ninepm%'
      ) AS has_nine_pm_addon
    FROM public.order_addons oa
    JOIN base_orders bo ON bo.id = oa.order_id
    GROUP BY oa.order_id
  ),
  waivers_ranked AS (
    SELECT w.order_reference, w.status, w.agreed_at,
      row_number() OVER (PARTITION BY w.order_reference ORDER BY w.created_at DESC) AS rn
    FROM public.waivers w
    WHERE w.order_reference IN (SELECT booking_token FROM base_orders WHERE booking_token IS NOT NULL)
  ),
  inspections_ranked AS (
    SELECT i.order_id, i.status,
      row_number() OVER (PARTITION BY i.order_id ORDER BY i.created_at DESC) AS rn
    FROM public.inspections i
    JOIN base_orders bo ON bo.id = i.order_id
  )
  SELECT
    bo.id,
    bo.store_id,
    bo.order_date,
    bo.customer_id,
    bo.booking_customer_name,
    bo.status,
    bo.final_total,
    bo.web_notes,
    bo.payment_method_id,
    bo.deposit_method_id,
    bo.security_deposit,
    bo.card_fee_surcharge,
    bo.woo_order_id,
    bo.booking_token,
    bo.partner_ref,
    c.name AS customer_name,
    c.mobile AS customer_mobile,
    c.email AS customer_email,
    COALESCE(ia.items, '[]'::jsonb) AS items,
    COALESCE(pa.total_paid, 0) AS total_paid,
    COALESCE(pa.pending_extensions_total, 0) AS pending_extensions_total,
    COALESCE(pa.has_extension, false) AS has_extension,
    COALESCE(aa.has_nine_pm_addon, false) AS has_nine_pm_addon,
    COALESCE(wr.status, 'pending') AS waiver_status,
    wr.agreed_at AS waiver_signed_at,
    CASE WHEN ir.status = 'completed' THEN 'completed' ELSE 'pending' END AS inspection_status
  FROM base_orders bo
  LEFT JOIN public.customers c ON c.id = bo.customer_id
  LEFT JOIN items_agg ia ON ia.order_id = bo.id
  LEFT JOIN payments_agg pa ON pa.order_id = bo.id
  LEFT JOIN addons_agg aa ON aa.order_id = bo.id
  LEFT JOIN waivers_ranked wr ON wr.order_reference = bo.booking_token AND wr.rn = 1
  LEFT JOIN inspections_ranked ir ON ir.order_id = bo.id AND ir.rn = 1
  ORDER BY bo.order_date DESC;
$$;

REVOKE ALL ON FUNCTION public.get_enriched_orders(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enriched_orders(text, text[]) TO service_role;
