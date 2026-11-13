-- ============================================================
-- Payroll ledger accounts and employer contribution amounts.
--
-- Payroll used to post net pay only (DR wages / CR cash). Gross-to-net
-- posting needs somewhere to hold what is owed but not yet paid:
-- statutory contributions (employee + employer share), 13th month pay,
-- vehicle allowance balances and the tips pool.
--
-- Existing accounts that are reused rather than recreated:
--   TIPS-PAYABLE-store-lolas       (Liability, tips pool)
--   EXP-VEH-ALLOWANCE-store-lolas  (Expense, vehicle allowance)
--   EXP-TRANSFER-FEE-store-lolas   (Expense, bank / GCash transfer fees)
--   Employee-Advance               (Asset, cash advances receivable)
-- ============================================================

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active) VALUES
  ('SSS-PAYABLE',               'SSS Contributions Payable',        'Liability', 'company', true),
  ('PHILHEALTH-PAYABLE',        'PhilHealth Contributions Payable', 'Liability', 'company', true),
  ('PAGIBIG-PAYABLE',           'Pag-IBIG Contributions Payable',   'Liability', 'company', true),
  ('EXP-EMPLOYER-CONTRIB',      'Employer Statutory Contributions', 'Expense',   'company', true),
  ('THIRTEENTH-MONTH-PAYABLE',  '13th Month Pay Payable',           'Liability', 'company', true),
  ('EXP-THIRTEENTH-MONTH',      '13th Month Pay',                   'Expense',   'company', true),
  ('VEHICLE-ALLOWANCE-PAYABLE', 'Staff Vehicle Allowance Payable',  'Liability', 'company', true),
  ('EXP-STAFF-COMMISSION',      'Staff Commission',                 'Expense',   'company', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active) VALUES
  ('TIPS-PAYABLE-store-lolas',      'Tips',              'Liability', 'company',     true),
  ('EXP-VEH-ALLOWANCE-store-lolas', 'Vehicle Allowance', 'Expense',   'store-lolas', true),
  ('EXP-TRANSFER-FEE-store-lolas',  'Transfer Fee',      'Expense',   'store-lolas', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employer_sss_amt        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_philhealth_amt numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_pagibig_amt    numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employees.sss_deduction_amt IS 'Employee share of SSS, deducted from the end-of-month payslip.';
COMMENT ON COLUMN public.employees.employer_sss_amt IS 'Employer share of SSS per month, accrued on the end-of-month run.';
