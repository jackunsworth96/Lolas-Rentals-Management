-- V10-11: Top-level transfer fields + updated_at for orders_raw inbox SELECT (no payload).
ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS transfer_pax_count integer,
  ADD COLUMN IF NOT EXISTS transfer_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_updated_at ON public.orders_raw;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.orders_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
