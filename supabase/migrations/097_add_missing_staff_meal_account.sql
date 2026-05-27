-- Migration 097: Add missing EXP-STAFF-MEAL-store-lolas chart-of-accounts row
--
-- Background: An expense category "Staff Meal" (or similar) was configured with
-- account_id = 'EXP-STAFF-MEAL-store-lolas', but that row was never present in
-- chart_of_accounts.  This caused a FK violation on journal_entries whenever a
-- paid expense was submitted in that category (Sentry issue 114139190).
--
-- This migration inserts the account idempotently so existing expense categories
-- referencing it become valid and future journal entries can post successfully.

INSERT INTO chart_of_accounts (id, name, account_type, store_id, is_active)
SELECT
  'EXP-STAFF-MEAL-store-lolas',
  'Staff Meals',
  'Expense',
  'store-lolas',
  true
WHERE EXISTS (
  SELECT 1
  FROM stores
  WHERE id = 'store-lolas'
)
ON CONFLICT (id) DO NOTHING;
