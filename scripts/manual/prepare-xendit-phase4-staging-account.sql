-- Staging-only transfer income definition. No balances or journal entries are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('lolas:xendit:phase4:staging-account'));

DO $preflight$
BEGIN
  IF to_regclass('public.chart_of_accounts') IS NULL OR to_regclass('public.stores') IS NULL THEN
    RAISE EXCEPTION 'Phase 4 staging account setup requires the existing store and chart tables';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = 'store-lolas') THEN
    RAISE EXCEPTION 'Phase 4 staging account setup requires store-lolas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = 'INCOME-TRANSFER-store-lolas'
      AND (name IS DISTINCT FROM 'Transfer Revenue' OR account_type IS DISTINCT FROM 'Income'
        OR store_id IS DISTINCT FROM 'store-lolas' OR is_active IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'Existing transfer income account differs from the reviewed staging definition';
  END IF;
END;
$preflight$;

INSERT INTO public.chart_of_accounts(id,name,account_type,store_id,is_active)
VALUES('INCOME-TRANSFER-store-lolas','Transfer Revenue','Income','store-lolas',true)
ON CONFLICT(id) DO NOTHING;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = 'INCOME-TRANSFER-store-lolas'
      AND name = 'Transfer Revenue' AND account_type = 'Income'
      AND store_id = 'store-lolas' AND is_active) THEN
    RAISE EXCEPTION 'Transfer income account verification failed';
  END IF;
END;
$verify$;
COMMIT;
