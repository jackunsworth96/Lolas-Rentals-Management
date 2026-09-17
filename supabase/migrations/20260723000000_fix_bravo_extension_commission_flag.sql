-- The earlier Bravo migration targeted the obsolete slug "bravo". This
-- additive correction is safe for databases that already recorded that
-- migration and does not require a reset or migration replay.
UPDATE public.accommodation_partners
SET commission_includes_extensions = true
WHERE slug = 'bravo-beach-resort'
  AND commission_includes_extensions IS DISTINCT FROM true;
