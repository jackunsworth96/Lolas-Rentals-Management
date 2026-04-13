-- ============================================================
-- 068: Add cancellation_token to orders_raw
-- Used to authenticate public cancel requests (S-1 fix)
-- ============================================================
ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS cancellation_token text;

CREATE INDEX IF NOT EXISTS idx_orders_raw_cancellation_token
  ON public.orders_raw (cancellation_token)
  WHERE cancellation_token IS NOT NULL;
