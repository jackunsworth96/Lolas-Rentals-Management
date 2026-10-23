-- ============================================================
-- Create transfer_reminder_log table
--
-- Mirrors delivery_reminder_log, but for airport transfers rather than
-- order pickup/dropoff legs. Tracks acknowledgment and Telegram escalation
-- status for transfers due soon, so the unmissable-reminder modal (and its
-- Telegram escalation) can be extended to cover transfers alongside orders.
--
-- See also: 146_delivery_reminder_log.sql, which this intentionally mirrors.
-- A separate table (rather than reusing delivery_reminder_log) is used
-- because transfers are keyed by transfer_id with no event_type split —
-- there is one pickup moment per transfer, not a pickup/dropoff pair.
-- ============================================================

CREATE TABLE public.transfer_reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id       text        NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  acknowledged_at   timestamptz,
  acknowledged_by   text,
  telegram_sent_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id)
);

CREATE INDEX transfer_reminder_log_transfer_idx ON public.transfer_reminder_log (transfer_id);

ALTER TABLE public.transfer_reminder_log ENABLE ROW LEVEL SECURITY;
-- All writes go through the API server (service role key, bypasses RLS).
-- No direct client access is required.
