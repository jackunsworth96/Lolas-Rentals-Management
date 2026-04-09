-- ============================================================
-- 041: Charity donation support
--   1. Add charity_donation column to orders_raw (direct bookings)
--   2. Create CHARITY-PAYABLE liability account for donations owed to Be Pawsitive
-- ============================================================

-- 1. orders_raw column
ALTER TABLE orders_raw
  ADD COLUMN IF NOT EXISTS charity_donation numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Chart of accounts — company-level liability
INSERT INTO chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES ('CHARITY-PAYABLE', 'Charity Donations Payable', 'Liability', 'company', true)
ON CONFLICT (id) DO NOTHING;
