-- Staging-only bootstrap for the currently empty chart of accounts.
-- Run manually after a backup and provider review of live Xendit sessions.
-- This script inserts account definitions and routing, never balances.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('lolas-xendit-phase3-staging-accounts'));
LOCK TABLE public.chart_of_accounts, public.payment_routing_rules IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE v_expected record;
BEGIN
  IF to_regclass('public.stores') IS NULL
     OR to_regclass('public.payment_methods') IS NULL
     OR to_regclass('public.chart_of_accounts') IS NULL
     OR to_regclass('public.payment_routing_rules') IS NULL
     OR to_regclass('public.journal_entries') IS NULL
     OR to_regclass('public.xendit_payment_sessions') IS NULL THEN
    RAISE EXCEPTION 'Staging account setup requires the existing stores, accounting, routing, and Xendit tables';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = 'store-lolas') THEN
    RAISE EXCEPTION 'Staging account setup requires store-lolas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods
      WHERE id = 'xendit' AND is_active AND gateway_provider = 'xendit') THEN
    RAISE EXCEPTION 'Staging account setup requires the active Xendit payment method';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id NOT IN (
      'AR-RENTAL-store-lolas', 'INCOME-RENTAL-store-lolas',
      'DEPOSITS-HELD-LOLAS', 'XENDIT-CLEARING-store-lolas')) THEN
    RAISE EXCEPTION 'Staging account setup requires an empty chart or only its four reviewed accounts; inspect existing accounting data';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries) THEN
    RAISE EXCEPTION 'Staging has journal history; inspect it before bootstrapping accounts';
  END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_payment_sessions
      WHERE status IN ('creating', 'active', 'reconciliation_required')) THEN
    RAISE EXCEPTION 'Resolve live or disputed Xendit sessions with the provider before staging account setup';
  END IF;
  FOR v_expected IN SELECT * FROM (VALUES
      ('AR-RENTAL-store-lolas', 'Accounts Receivable - Rentals', 'Asset'),
      ('INCOME-RENTAL-store-lolas', 'Rental Revenue', 'Income'),
      ('DEPOSITS-HELD-LOLAS', 'Deposits Held Lolas', 'Liability'),
      ('XENDIT-CLEARING-store-lolas', 'Xendit Clearing (unsettled)', 'Asset')
    ) AS expected(id, name, account_type) LOOP
    IF EXISTS (SELECT 1 FROM public.chart_of_accounts a
        WHERE a.id = v_expected.id
          AND (a.name IS DISTINCT FROM v_expected.name
            OR a.account_type IS DISTINCT FROM v_expected.account_type
            OR a.store_id IS DISTINCT FROM 'store-lolas'
            OR a.is_active IS DISTINCT FROM true)) THEN
      RAISE EXCEPTION 'Existing account % differs from the reviewed staging definition', v_expected.id;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.payment_routing_rules
      WHERE store_id = 'store-lolas' AND payment_method_id = 'xendit'
        AND received_into_account_id IS DISTINCT FROM 'XENDIT-CLEARING-store-lolas') THEN
    RAISE EXCEPTION 'Existing store-lolas Xendit routing points to another account';
  END IF;
END;
$preflight$;

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES
  ('AR-RENTAL-store-lolas', 'Accounts Receivable - Rentals', 'Asset', 'store-lolas', true),
  ('INCOME-RENTAL-store-lolas', 'Rental Revenue', 'Income', 'store-lolas', true),
  ('DEPOSITS-HELD-LOLAS', 'Deposits Held Lolas', 'Liability', 'store-lolas', true),
  ('XENDIT-CLEARING-store-lolas', 'Xendit Clearing (unsettled)', 'Asset', 'store-lolas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_routing_rules
  (store_id, payment_method_id, received_into_account_id)
VALUES ('store-lolas', 'xendit', 'XENDIT-CLEARING-store-lolas')
ON CONFLICT (store_id, payment_method_id) DO NOTHING;

DO $verify$
DECLARE v_expected record;
BEGIN
  FOR v_expected IN SELECT * FROM (VALUES
      ('AR-RENTAL-store-lolas', 'Accounts Receivable - Rentals', 'Asset'),
      ('INCOME-RENTAL-store-lolas', 'Rental Revenue', 'Income'),
      ('DEPOSITS-HELD-LOLAS', 'Deposits Held Lolas', 'Liability'),
      ('XENDIT-CLEARING-store-lolas', 'Xendit Clearing (unsettled)', 'Asset')
    ) AS expected(id, name, account_type) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
        WHERE a.id = v_expected.id AND a.name = v_expected.name
          AND a.account_type = v_expected.account_type
          AND a.store_id = 'store-lolas' AND a.is_active) THEN
      RAISE EXCEPTION 'Staging account verification failed for %', v_expected.id;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.payment_routing_rules
      WHERE store_id = 'store-lolas' AND payment_method_id = 'xendit'
        AND received_into_account_id = 'XENDIT-CLEARING-store-lolas') THEN
    RAISE EXCEPTION 'Staging Xendit account or routing verification failed';
  END IF;
END;
$verify$;
COMMIT;
