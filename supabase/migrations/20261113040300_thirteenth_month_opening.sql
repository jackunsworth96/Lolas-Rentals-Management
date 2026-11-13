-- 31 March was paid on the Finance sheet but left blank on the staff sheet.
INSERT INTO timesheets (id, employee_id, name, date, day_type, regular_hours, overtime_hours, day_fraction, payroll_status, store_id, daily_notes)
SELECT gen_random_uuid()::text, e.id, e.full_name, DATE '2026-03-31', 'Regular', 8, 0, 1, 'Paid', 'store-lolas',
       'Paid on Finance sheet (blank on Staff Record Keeping sheet)'
FROM employees e
WHERE e.id IN ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 'b403b39a-07df-4748-bc64-3d2c997930f0')
ON CONFLICT (employee_id, date) DO NOTHING;

-- Leave used this leave year, from the imported timesheets.
UPDATE employees e
SET holiday_used = (SELECT count(*) FROM timesheets t WHERE t.employee_id = e.id AND t.date >= DATE '2026-01-01' AND t.day_type = 'Holiday'),
    sick_used    = (SELECT count(*) FROM timesheets t WHERE t.employee_id = e.id AND t.date >= DATE '2026-01-01' AND t.day_type = 'Sick')
WHERE e.id IN ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 'b403b39a-07df-4748-bc64-3d2c997930f0', '3ac30508-e442-46c3-b7fa-b134e32241ea');

-- 13th month accrued Jan-Oct 2026 (basic pay incl. paid leave and 1 Jan, per the Finance sheet, / 12).
-- Payroll runs in the system add to these balances from November.
WITH opening(employee_id, amount) AS (
  VALUES ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 14566.95),
         ('b403b39a-07df-4748-bc64-3d2c997930f0', 10729.17),
         ('3ac30508-e442-46c3-b7fa-b134e32241ea',  9412.03)
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
         '13th month accrued Jan–Oct 2026 — ' || full_name, 'opening_balance', employee_id
  FROM todo
  CROSS JOIN LATERAL (VALUES ('EXP-THIRTEENTH-MONTH', amount, 0::numeric), ('THIRTEENTH-MONTH-PAYABLE', 0::numeric, amount)) l(account_id, debit, credit)
  RETURNING reference_id
)
UPDATE employees e SET thirteenth_month_accrued = o.amount
FROM todo o
WHERE e.id = o.employee_id;
