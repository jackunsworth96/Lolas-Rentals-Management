-- ============================================================================
-- 027: Consolidate duplicate accounts into company-wide accounts
-- ============================================================================
-- Mapping (old → new):
--   GCASH-store-bass             → GCASH-store-lolas      (will be re-homed to company)
--   SAFE-store-bass              → SAFE-store-lolas       (will be re-homed to company)
--   BANK-BDO-store-bass          → BANK-BDO-store-lolas   (will be re-homed to company)
--   BANK-UNION-BANK-store-bass   → BANK-UNION-BANK-store-lolas (will be re-homed to company)
--   NEW-VEHICLE-FUND-store-bass  → NEW-VEHICLE-FUND-store-lolas (will be re-homed to company)
--   CHARITY-EXPENSE-store-bass   → CHARITY-EXPENSE        (company account — must exist already)
--   CHARITY-EXPENSE-store-lolas  → CHARITY-EXPENSE        (company account — must exist already)
--   EXP-FUEL                     → (delete orphan, only if zero references)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Reassign all FK references from old accounts → replacement accounts
-- ────────────────────────────────────────────────────────────────────────────

-- Helper: define the mapping as a CTE so we only state it once
-- old_id → new_id
CREATE TEMP TABLE _account_remap (old_id text PRIMARY KEY, new_id text NOT NULL);
INSERT INTO _account_remap (old_id, new_id) VALUES
  ('GCASH-store-bass',            'GCASH-store-lolas'),
  ('SAFE-store-bass',             'SAFE-store-lolas'),
  ('BANK-BDO-store-bass',         'BANK-BDO-store-lolas'),
  ('BANK-UNION-BANK-store-bass',  'BANK-UNION-BANK-store-lolas'),
  ('NEW-VEHICLE-FUND-store-bass', 'NEW-VEHICLE-FUND-store-lolas'),
  ('CHARITY-EXPENSE-store-bass',  'CHARITY-EXPENSE'),
  ('CHARITY-EXPENSE-store-lolas', 'CHARITY-EXPENSE');

-- 1a. journal_entries.account_id
UPDATE journal_entries je
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  je.account_id = r.old_id;

-- 1b. payments.account_id
UPDATE payments p
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  p.account_id = r.old_id;

-- 1c. expenses.paid_from
UPDATE expenses e
SET    paid_from = r.new_id
FROM   _account_remap r
WHERE  e.paid_from = r.old_id;

-- 1d. expenses.account_id
UPDATE expenses e
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  e.account_id = r.old_id;

-- 1e. card_settlements.account_id
UPDATE card_settlements cs
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  cs.account_id = r.old_id;

-- 1f. maintenance.paid_from
UPDATE maintenance m
SET    paid_from = r.new_id
FROM   _account_remap r
WHERE  m.paid_from = r.old_id;

-- 1g. misc_sales.received_into
UPDATE misc_sales ms
SET    received_into = r.new_id
FROM   _account_remap r
WHERE  ms.received_into = r.old_id;

-- 1h. misc_sales.income_account_id
UPDATE misc_sales ms
SET    income_account_id = r.new_id
FROM   _account_remap r
WHERE  ms.income_account_id = r.old_id;

-- 1i. expense_categories.account_id
UPDATE expense_categories ec
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  ec.account_id = r.old_id;

-- 1j. recurring_bills.account_id
UPDATE recurring_bills rb
SET    account_id = r.new_id
FROM   _account_remap r
WHERE  rb.account_id = r.old_id;

-- 1k. payment_routing_rules.received_into_account_id
UPDATE payment_routing_rules prr
SET    received_into_account_id = r.new_id
FROM   _account_remap r
WHERE  prr.received_into_account_id = r.old_id;

-- 1l. payment_routing_rules.card_settlement_account_id
UPDATE payment_routing_rules prr
SET    card_settlement_account_id = r.new_id
FROM   _account_remap r
WHERE  prr.card_settlement_account_id = r.old_id;

-- 1m. stores.card_fee_account_id
UPDATE stores s
SET    card_fee_account_id = r.new_id
FROM   _account_remap r
WHERE  s.card_fee_account_id = r.old_id;

-- 1n. stores.default_cash_account_id
UPDATE stores s
SET    default_cash_account_id = r.new_id
FROM   _account_remap r
WHERE  s.default_cash_account_id = r.old_id;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Delete the old duplicate accounts (now safe — no FK references)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM chart_of_accounts
WHERE id IN (
  'GCASH-store-bass',
  'SAFE-store-bass',
  'BANK-BDO-store-bass',
  'BANK-UNION-BANK-store-bass',
  'NEW-VEHICLE-FUND-store-bass',
  'CHARITY-EXPENSE-store-bass',
  'CHARITY-EXPENSE-store-lolas'
);

-- Delete EXP-FUEL orphan (only if it truly has zero references anywhere)
DELETE FROM chart_of_accounts
WHERE id = 'EXP-FUEL'
  AND NOT EXISTS (SELECT 1 FROM journal_entries       WHERE account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM payments              WHERE account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM expenses              WHERE paid_from  = 'EXP-FUEL' OR account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM card_settlements      WHERE account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM maintenance           WHERE paid_from  = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM misc_sales            WHERE received_into = 'EXP-FUEL' OR income_account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM expense_categories    WHERE account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM recurring_bills       WHERE account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM payment_routing_rules WHERE received_into_account_id = 'EXP-FUEL' OR card_settlement_account_id = 'EXP-FUEL')
  AND NOT EXISTS (SELECT 1 FROM stores                WHERE card_fee_account_id = 'EXP-FUEL' OR default_cash_account_id = 'EXP-FUEL');

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Re-home the surviving accounts to 'company' store
-- ────────────────────────────────────────────────────────────────────────────

UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'GCASH-store-lolas';
UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'SAFE-store-lolas';
UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'BANK-BDO-store-lolas';
UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'BANK-UNION-BANK-store-lolas';
UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'NEW-VEHICLE-FUND-store-lolas';
UPDATE chart_of_accounts SET store_id = 'company' WHERE id = 'CHARITY-EXPENSE';

DROP TABLE _account_remap;

COMMIT;
