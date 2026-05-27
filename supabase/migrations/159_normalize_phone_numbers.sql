-- ============================================================
-- 156: Normalise Philippine mobile numbers to E.164
--
-- Creates a reusable normalize_phone() function and backfills
-- existing denormalised values in orders_raw.customer_mobile
-- and customers.mobile to +639XXXXXXXXX format.
--
-- Recognised input formats → +639XXXXXXXXX:
--   09XXXXXXXXX  (11 digits, leading 0)
--   639XXXXXXXXX (12 digits, country code without +)
--   9XXXXXXXXX   (10 digits, bare local number)
--   +639XXXXXXXXX (already E.164 — whitespace/dashes stripped)
--
-- Non-Philippine numbers and NULLs are returned unchanged.
-- No constraint is added; write-time normalisation is handled
-- separately.
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(p, '[\s\-().]', '', 'g');

  IF d LIKE '+%' THEN
    RETURN d;
  END IF;

  IF d ~ '^09[0-9]{9}$' THEN
    RETURN '+63' || substring(d FROM 2);
  END IF;

  IF d ~ '^639[0-9]{9}$' THEN
    RETURN '+' || d;
  END IF;

  IF d ~ '^9[0-9]{9}$' THEN
    RETURN '+63' || d;
  END IF;

  RETURN p;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone IS
  'Normalises a Philippine mobile number to E.164 (+639XXXXXXXXX). '
  'Handles 09XX, 639XX, 9XX, and already-E.164 inputs. '
  'Strips whitespace and dashes. Returns the original value for '
  'non-Philippine numbers or unrecognised formats. NULL-safe.';

UPDATE public.orders_raw
SET    customer_mobile = public.normalize_phone(customer_mobile)
WHERE  customer_mobile IS NOT NULL
  AND  customer_mobile IS DISTINCT FROM public.normalize_phone(customer_mobile);

UPDATE public.customers
SET    mobile     = public.normalize_phone(mobile),
       updated_at = now()
WHERE  mobile IS NOT NULL
  AND  mobile IS DISTINCT FROM public.normalize_phone(mobile);
