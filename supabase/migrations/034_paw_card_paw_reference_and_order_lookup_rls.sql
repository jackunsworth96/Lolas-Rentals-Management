-- Paw log reference (PAW-…) is separate from rental order_id (orders.id).
ALTER TABLE public.paw_card_entries ADD COLUMN IF NOT EXISTS paw_reference TEXT;

-- Stop writing PAW-* into order_id; only backfill paw_reference when missing.
CREATE OR REPLACE FUNCTION public.paw_card_assign_paw_reference()
RETURNS TRIGGER AS $$
DECLARE
  suffix text;
BEGIN
  IF NEW.paw_reference IS NULL OR length(trim(NEW.paw_reference)) = 0 THEN
    suffix := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    NEW.paw_reference := 'PAW-' || to_char(timezone('Asia/Manila', now())::date, 'YYYYMMDD') || '-' || suffix;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paw_card_entries_assign_order_id ON public.paw_card_entries;
DROP FUNCTION IF EXISTS public.paw_card_assign_order_id();

DROP TRIGGER IF EXISTS paw_card_entries_assign_paw_reference ON public.paw_card_entries;
CREATE TRIGGER paw_card_entries_assign_paw_reference
  BEFORE INSERT ON public.paw_card_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.paw_card_assign_paw_reference();

-- Let paw-card users (Supabase Auth) read their customer row and linked orders by email match.
CREATE POLICY customers_select_own_email_for_paw_card
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    email IS NOT NULL
    AND lower(trim(email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );

CREATE POLICY orders_select_own_customer_for_paw_card
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = orders.customer_id
        AND c.email IS NOT NULL
        AND lower(trim(c.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
    )
  );
