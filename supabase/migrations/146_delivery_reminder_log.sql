-- ============================================================
-- 146: Create delivery_reminder_log table
--
-- Tracks acknowledgment and Telegram escalation status for
-- upcoming off-site pickup (delivery) and dropoff (collection)
-- events. The frontend modal polls for unacknowledged events
-- in the next 35 minutes and shows a per-event alert. If an
-- event is not acknowledged within 10 minutes of the modal
-- appearing (T-20), the backend cron escalates via Telegram.
-- ============================================================

CREATE TABLE public.delivery_reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id     text        NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  event_type        text        NOT NULL CHECK (event_type IN ('pickup', 'dropoff')),
  acknowledged_at   timestamptz,
  acknowledged_by   text,
  telegram_sent_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, event_type)
);

CREATE INDEX delivery_reminder_log_item_idx ON public.delivery_reminder_log (order_item_id);

ALTER TABLE public.delivery_reminder_log ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).
-- No direct client access is required.
