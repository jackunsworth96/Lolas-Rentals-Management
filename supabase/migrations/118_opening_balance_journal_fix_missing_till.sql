-- ============================================================
-- 118: Ensure Cash Till COA exists, then post opening balance
--
-- Migration 117 required CASH-TILL-store-lolas; some databases
-- had the other six accounts but not this one (seed not applied),
-- so zero journal rows were inserted. This migration adds the
-- missing account and idempotently inserts the same seven legs as 117
-- when the transaction is still absent.
-- ============================================================

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES
  ('CASH-TILL-store-lolas', 'Cash Till', 'Asset', 'store-lolas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.journal_entries (
  id,
  transaction_id,
  period,
  date,
  store_id,
  account_id,
  description,
  debit,
  credit,
  reference_type,
  reference_id,
  created_by
)
SELECT
  v.id,
  v.transaction_id,
  v.period,
  v.date,
  v.store_id,
  v.account_id,
  v.description,
  v.debit,
  v.credit,
  v.reference_type,
  v.reference_id,
  v.created_by
FROM (
  VALUES
    ('je-ob-20260427-01', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'BANK-BDO-store-lolas', 'Opening balance — BDO Bank', 1849.52, 0, 'opening_balance', NULL::text, NULL::text),
    ('je-ob-20260427-02', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'BANK-UNION-BANK-store-lolas', 'Opening balance — Union Bank', 108079.32, 0, 'opening_balance', NULL, NULL),
    ('je-ob-20260427-03', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'SAFE-store-lolas', 'Opening balance — safe', 542801.25, 0, 'opening_balance', NULL, NULL),
    ('je-ob-20260427-04', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'CASH-TILL-store-lolas', 'Opening balance — cash till (pending deposit)', 30000.00, 0, 'opening_balance', NULL, NULL),
    ('je-ob-20260427-05', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'CASH-CHARITY-WALLET', 'Opening balance — charity wallet', 161.25, 0, 'opening_balance', NULL, NULL),
    ('je-ob-20260427-06', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'CHARITY-PAYABLE', 'Opening balance — charity donations payable', 0, 161.25, 'opening_balance', NULL, NULL),
    ('je-ob-20260427-07', 'tx-opening-balance-20260427', '2026-04', DATE '2026-04-27', 'store-lolas',
     'OPENING-BALANCE-EQUITY', 'Opening balance — equity', 0, 682730.09, 'opening_balance', NULL, NULL)
) AS v (
  id, transaction_id, period, date, store_id,
  account_id, description, debit, credit, reference_type, reference_id, created_by
)
WHERE EXISTS (SELECT 1 FROM public.stores WHERE id = 'store-lolas')
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE transaction_id = 'tx-opening-balance-20260427'
  )
  AND (
    SELECT COUNT(*)::int
    FROM public.chart_of_accounts
    WHERE id IN (
      'BANK-BDO-store-lolas',
      'BANK-UNION-BANK-store-lolas',
      'SAFE-store-lolas',
      'CASH-TILL-store-lolas',
      'CHARITY-PAYABLE',
      'CASH-CHARITY-WALLET',
      'OPENING-BALANCE-EQUITY'
    )
  ) = 7;
