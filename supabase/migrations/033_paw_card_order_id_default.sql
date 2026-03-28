-- Ensure every paw card row gets a PAW-YYYYMMDD-XXXX reference even if the client
-- payload omits or strips order_id (PostgREST / RLS edge cases).
CREATE OR REPLACE FUNCTION public.paw_card_assign_order_id()
RETURNS TRIGGER AS $$
DECLARE
  suffix text;
BEGIN
  IF NEW.order_id IS NULL OR length(trim(NEW.order_id)) = 0 THEN
    suffix := lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    NEW.order_id := 'PAW-' || to_char(timezone('Asia/Manila', now())::date, 'YYYYMMDD') || '-' || suffix;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS paw_card_entries_assign_order_id ON public.paw_card_entries;

CREATE TRIGGER paw_card_entries_assign_order_id
  BEFORE INSERT ON public.paw_card_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.paw_card_assign_order_id();
