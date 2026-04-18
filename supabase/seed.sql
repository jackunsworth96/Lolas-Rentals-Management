-- ============================================================
-- supabase/seed.sql
-- PRODUCTION SEED
-- ============================================================
-- Run ONCE after all migrations have been applied
-- (085_performance_indexes.sql is the highest at the time this
-- seed was written).  Safe to re-run: every INSERT uses
-- ON CONFLICT DO NOTHING so existing rows are preserved.
--
-- Does NOT contain customer data, order data, or employee data.
--
-- Apply in the Supabase SQL editor (service-role context) or via
--   psql $DATABASE_URL -f supabase/seed.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1.  TRANSFER ROUTES
-- ============================================================
-- No migration has ever seeded this table; rows were historically
-- entered through the admin UI.  The price and driver_cut values
-- below match the three van types the public booking page
-- supports (TransferBookingPage.tsx → mapVanTypeMeta):
--
--   Shared Van      pricing_type = per_head  (total = price × pax)
--   Private Van     pricing_type = fixed
--   Private TukTuk  pricing_type = fixed
--
-- ⚠️  VERIFY OR UPDATE price and driver_cut before go-live.
--     The values here are representative placeholders.
--
-- The UI code in TransferBookingPage.tsx is hard-wired to
-- store-lolas (TRANSFER_STORE_ID = 'store-lolas'), so all six
-- rows use that store.
--
-- Note: the prompt specified "10 rows" but the application code
-- only recognises three van types ('shared', 'tuk', other) and
-- there are two directions — giving 6 canonical rows.  Add extra
-- rows via the Settings → Transfer Routes UI if additional van
-- types or intermediate stops are required.
-- ============================================================

INSERT INTO public.transfer_routes
  (route, van_type, price, pricing_type, driver_cut, store_id, is_active)
VALUES
  -- ── Inbound  (IAO Airport → General Luna) ────────────────
  ('IAO Airport → General Luna', 'Shared Van',      250.00, 'per_head', 150.00, 'store-lolas', true),
  ('IAO Airport → General Luna', 'Private Van',    2500.00, 'fixed',   1500.00, 'store-lolas', true),
  ('IAO Airport → General Luna', 'Private TukTuk', 1500.00, 'fixed',    900.00, 'store-lolas', true),
  -- ── Outbound (General Luna → IAO Airport) ────────────────
  ('General Luna → IAO Airport', 'Shared Van',      250.00, 'per_head', 150.00, 'store-lolas', true),
  ('General Luna → IAO Airport', 'Private Van',    2500.00, 'fixed',   1500.00, 'store-lolas', true),
  ('General Luna → IAO Airport', 'Private TukTuk', 1500.00, 'fixed',    900.00, 'store-lolas', true)
ON CONFLICT (route, van_type, store_id) DO NOTHING;


-- ============================================================
-- 2.  CHART OF ACCOUNTS
-- ============================================================
-- All dynamic account resolution in the API uses name-pattern
-- matching via store_id IN (<storeId>, 'company'), so accounts
-- under store_id = 'company' are visible to every store query.
--
-- MINIMUM accounts needed before the first real order:
--
--  store-lolas level
--  ─────────────────
--  AR-RENTAL-store-lolas      Asset     resolveStoreAccounts (name ∋ 'receivable')
--  INCOME-RENTAL-store-lolas  Income    resolveStoreAccounts (name ∋ 'rental')
--  CASH-TILL-store-lolas      Asset     resolvePayrollAccounts (name ∋ 'cash')
--  DEPOSIT-LIAB-store-lolas   Liability collectPaymentAtomic / settleOrderAtomic
--  WAGES-EXP-store-lolas      Expense   resolvePayrollAccounts (name ∋ 'wage')
--  OWNER-DRAWINGS-store-lolas Equity    accounting.ts owner-drawings journal
--
--  company level (visible to all stores via IN query)
--  ──────────────────────────────────────────────────
--  CHARITY-PAYABLE            Liability migration 041 already inserts this row;
--                                        included here for idempotent completeness.
--                                        resolveCharityPayableAccount searches by id.
--  GCASH-store-lolas          Asset     hardcoded in run-payroll.ts + accounting.ts
--  SAFE-store-lolas           Asset     resolvePayrollAccounts (name ∋ 'safe')
--  BANK-UNION-BANK-store-lolas Asset    hardcoded in run-payroll.ts + accounting.ts
--  BANK-BDO-store-lolas       Asset     referenced in migration 027 remapping
--  NEW-VEHICLE-FUND-store-lolas Asset   referenced in migration 027 remapping
--  CASH-LOLA                  Asset     hardcoded in accounting.ts owner-drawings
-- ============================================================

INSERT INTO public.chart_of_accounts
  (id, name, account_type, store_id, is_active)
VALUES
  -- ── store-lolas ──────────────────────────────────────────
  ('AR-RENTAL-store-lolas',      'Accounts Receivable — Rentals', 'Asset',     'store-lolas', true),
  ('INCOME-RENTAL-store-lolas',  'Rental Income',                 'Income',    'store-lolas', true),
  ('CASH-TILL-store-lolas',      'Cash Till',                     'Asset',     'store-lolas', true),
  ('DEPOSIT-LIAB-store-lolas',   'Security Deposit Liability',    'Liability', 'store-lolas', true),
  ('WAGES-EXP-store-lolas',      'Wages Expense',                 'Expense',   'store-lolas', true),
  ('OWNER-DRAWINGS-store-lolas', 'Owner Drawings',                'Equity',    'store-lolas', true),
  -- ── company (shared across stores) ──────────────────────
  ('CHARITY-PAYABLE',              'Charity Donations Payable', 'Liability', 'company', true),
  ('GCASH-store-lolas',            'GCash',                     'Asset',     'company', true),
  ('SAFE-store-lolas',             'Safe',                      'Asset',     'company', true),
  ('BANK-UNION-BANK-store-lolas',  'Union Bank',                'Asset',     'company', true),
  ('BANK-BDO-store-lolas',         'BDO Bank',                  'Asset',     'company', true),
  ('NEW-VEHICLE-FUND-store-lolas', 'New Vehicle Fund',          'Asset',     'company', true),
  ('CASH-LOLA',                    'Cash (Lola)',                'Asset',     'company', true)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- After running this seed, verify in Supabase dashboard that
-- transfer_routes and chart_of_accounts rows are present before
-- processing any orders.
