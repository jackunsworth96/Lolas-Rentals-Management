-- Correct transfer route prices for all six active records (both directions per van type).
-- Prices updated 2026-05-11: Shared Van 250→450, Private Van 2500→3500, Private TukTuk 1500→1800.

UPDATE public.transfer_routes
SET price = 450.00
WHERE van_type = 'Shared Van'
  AND is_active = true;

UPDATE public.transfer_routes
SET price = 3500.00
WHERE van_type = 'Private Van'
  AND is_active = true;

UPDATE public.transfer_routes
SET price = 1800.00
WHERE van_type = 'Private TukTuk'
  AND is_active = true;
