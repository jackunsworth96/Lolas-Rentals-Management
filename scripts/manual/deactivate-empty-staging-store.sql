-- Staging only. Review the output of inspect-staging-cashup-stores.sql first.
-- After a staging backup, run manually as the database owner. No records are
-- deleted or moved. The transaction aborts if the duplicate store is in use.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('lolas_deactivate_empty_staging_store'));

DO $deactivate$
DECLARE
  table_row record;
  usage_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = 'store-lolas' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Canonical store-lolas is missing or inactive';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = 'lolas-rentals' AND name = 'Lolas Rentals'
  ) THEN
    RAISE EXCEPTION 'Expected duplicate lolas-rentals row is missing or changed';
  END IF;
  PERFORM 1 FROM public.stores WHERE id = 'lolas-rentals' FOR UPDATE;

  FOR table_row IN
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'store_id'
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE store_id = $1', table_row.table_name)
      INTO usage_count USING 'lolas-rentals';
    IF usage_count > 0 THEN
      RAISE EXCEPTION 'Duplicate store is referenced by %.store_id (% rows)',
        table_row.table_name, usage_count;
    END IF;
  END LOOP;

  UPDATE public.stores SET is_active = false WHERE id = 'lolas-rentals' AND is_active = true;
END;
$deactivate$;

COMMIT;

SELECT id, name, is_active FROM public.stores
WHERE id IN ('lolas-rentals', 'store-lolas') ORDER BY id;
