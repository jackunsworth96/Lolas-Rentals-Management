-- ============================================================
-- 062_maya_checkouts.sql
-- Tracks Maya payment gateway checkout sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maya_checkouts (
  id                uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_id       text          NOT NULL UNIQUE,
  order_id          text          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id          text          NOT NULL REFERENCES public.stores(id),
  amount_php        numeric(12,2) NOT NULL,
  status            text          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','paid','payment_failed','payment_expired')),
  redirect_url      text          NOT NULL,
  created_by        text          REFERENCES public.employees(id) ON DELETE SET NULL,
  paid_at           timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Index for webhook lookups by checkout_id (already unique, 
-- but an explicit index speeds up the eq filter)
CREATE INDEX idx_maya_checkouts_checkout_id 
  ON public.maya_checkouts(checkout_id);

-- Index for looking up all checkouts for an order
CREATE INDEX idx_maya_checkouts_order_id 
  ON public.maya_checkouts(order_id);

-- Auto-update updated_at
CREATE TRIGGER set_maya_checkouts_updated_at
  BEFORE UPDATE ON public.maya_checkouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: only authenticated service role can insert/update 
-- (webhook runs as service role; backoffice API uses service role)
ALTER TABLE public.maya_checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.maya_checkouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
