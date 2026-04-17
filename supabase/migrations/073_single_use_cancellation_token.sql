-- ============================================================
-- 073: Single-use cancellation token (S-06)
-- Prevents a forwarded confirmation email from being used to
-- cancel an order that has already been cancelled.
-- ============================================================
ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS cancellation_token_used boolean NOT NULL DEFAULT false;
