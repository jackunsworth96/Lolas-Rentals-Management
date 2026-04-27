-- ============================================================
-- 117: Initial opening-balance journal (PHP)
--
-- Maps user lines to existing chart_of_accounts ids:
--   BDO  → BANK-BDO-store-lolas
--   Union → BANK-UNION-BANK-store-lolas
--   Safe → SAFE-store-lolas
--   Till / undeposited → CASH-TILL-store-lolas
--   Due to charity → CHARITY-PAYABLE
-- New accounts: charity wallet (asset) + opening balance equity.
--
-- journal_entries.store_id = store-lolas (operating store; RLS,
--   consistent with CASH-TILL and other day-to-day posting).
-- Idempotent: skips if transaction_id already exists, or if
--   store-lolas is missing.
-- ============================================================

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES
  ('CASH-CHARITY-WALLET', 'Charity wallet (held cash)', 'Asset', 'company', true),
  ('OPENING-BALANCE-EQUITY', 'Opening balance equity', 'Equity', 'company', true)
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
