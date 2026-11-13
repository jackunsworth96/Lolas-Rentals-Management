-- ============================================================
-- Geo's employment agreement (12 Oct 2026) and the leave policy it states.
-- ============================================================

-- What can be taken during probation, per leave type.
ALTER TABLE leave_config
  ADD COLUMN IF NOT EXISTS probation_rule_holiday text NOT NULL DEFAULT 'accrue'
    CHECK (probation_rule_holiday IN ('accrue', 'none', 'full')),
  ADD COLUMN IF NOT EXISTS probation_rule_sick text NOT NULL DEFAULT 'accrue'
    CHECK (probation_rule_sick IN ('accrue', 'none', 'full'));

-- Clause 5.5: annual leave can't be taken on probation; sick leave can.
UPDATE leave_config SET probation_rule_holiday = 'none', probation_rule_sick = 'full' WHERE store_id = 'store-lolas';

-- Clause 2.1 (probation 12 Oct 2026 – 12 Apr 2027) and 5.5 (18 annual, 7 sick).
UPDATE employees
SET probation_end_date = DATE '2027-04-12',
    holiday_allowance = 18,
    sick_allowance = 7
WHERE id = '43ae55f6-fe46-46d3-8652-b1424dc03d52';

-- Clause 5.2 / 8.3: 13th month from 5 Oct 2026. October salary (clause 5.1, pro-rated per half):
-- 1–15 Oct 13,000 × 11/15 = 9,533.33; 16–31 Oct 13,000; total 22,533.33 / 12 = 1,877.78.
WITH opening(employee_id, amount) AS (
  VALUES ('43ae55f6-fe46-46d3-8652-b1424dc03d52', 1877.78)
), todo AS (
  SELECT o.*, gen_random_uuid()::text AS tx, e.full_name
  FROM opening o JOIN employees e ON e.id = o.employee_id
  WHERE NOT EXISTS (
    SELECT 1 FROM journal_entries j
    WHERE j.reference_type = 'opening_balance' AND j.reference_id = o.employee_id AND j.account_id = 'THIRTEENTH-MONTH-PAYABLE'
  )
), legs AS (
  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
  SELECT gen_random_uuid()::text, tx, '2026-10', DATE '2026-10-31', 'store-lolas', l.account_id, l.debit, l.credit,
         '13th month accrued 5–31 Oct 2026 (salary 22,533.33 / 12) — ' || full_name, 'opening_balance', employee_id
  FROM todo
  CROSS JOIN LATERAL (VALUES ('EXP-THIRTEENTH-MONTH', amount, 0::numeric), ('THIRTEENTH-MONTH-PAYABLE', 0::numeric, amount)) l(account_id, debit, credit)
  RETURNING reference_id
)
UPDATE employees e SET thirteenth_month_accrued = o.amount
FROM todo o
WHERE e.id = o.employee_id;
