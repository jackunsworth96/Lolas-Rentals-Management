-- ============================================================
-- Create inbox_alert_log table
--
-- Acknowledgments for the back-office alert modal's Inbox events: a new web
-- order arriving, and an unactivated order whose pickup is under an hour away.
-- Mirrors delivery_reminder_log, but keyed by orders_raw.id because these
-- orders have no order_items yet.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inbox_alert_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_raw_id      uuid        NOT NULL REFERENCES public.orders_raw(id) ON DELETE CASCADE,
  event_type        text        NOT NULL CHECK (event_type IN ('new_order', 'activation_due')),
  acknowledged_at   timestamptz,
  acknowledged_by   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_raw_id, event_type)
);

ALTER TABLE public.inbox_alert_log ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).
