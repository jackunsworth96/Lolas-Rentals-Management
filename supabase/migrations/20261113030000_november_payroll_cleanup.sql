-- One-off clean-up of payroll inputs logged as plain expenses before the payroll rebuild.
-- Every statement is keyed on explicit ids and guarded so re-running is a no-op.

-- 1. Advance schedules from May were repaid outside the system: close them without a deduction.
UPDATE cash_advance_schedules
SET remaining_balance = 0, deducted = true, deducted_at = now()
WHERE id IN (
  '891c8d55-4619-4c88-ae30-91e1ec887dfb',
  '9b707c72-9d02-4670-be1c-ca6206534786',
  '13b6e6d3-e0bb-43d6-a09a-716fd3531ceb',
  '257c1ed3-354d-42f9-baa4-894e4c863797',
  '841c932d-ff00-46d8-a9a0-4971cf8866a4'
) AND remaining_balance > 0;

-- 2. Reland 24 Oct ₱500 was his October vehicle allowance, not an advance.
UPDATE cash_advance_schedules
SET remaining_balance = 0, deducted = true, deducted_at = now()
WHERE id = '5f011250-50ff-44c3-8eca-257865906526' AND remaining_balance > 0;

UPDATE expenses
SET category = 'Staff Vehicle Allowance', account_id = 'EXP-VEH-ALLOWANCE-store-lolas'
WHERE id = '61428b35-0284-46da-8acc-81711236e075';

UPDATE journal_entries
SET account_id = 'EXP-VEH-ALLOWANCE-store-lolas'
WHERE id = '74b08b1a-d378-4caa-97c7-60677e17c6db';

-- October's allowance was earned and spent in October, so the ledger nets to zero for that month.
INSERT INTO employee_allowance_ledger (employee_id, entry_date, entry_type, amount, expense_id, journal_transaction_id, note)
SELECT * FROM (VALUES
  ('b403b39a-07df-4748-bc64-3d2c997930f0', DATE '2026-10-24', 'opening',     500.00, NULL::text, NULL::text, 'October allowance'),
  ('b403b39a-07df-4748-bc64-3d2c997930f0', DATE '2026-10-24', 'withdrawal', -500.00, '61428b35-0284-46da-8acc-81711236e075', '49a5f822-ca75-471a-97a9-a4bdbef9b1e4', 'October fuel (logged as cash advance)')
) v(employee_id, entry_date, entry_type, amount, expense_id, journal_transaction_id, note)
WHERE NOT EXISTS (
  SELECT 1 FROM employee_allowance_ledger l
  WHERE l.employee_id = 'b403b39a-07df-4748-bc64-3d2c997930f0' AND l.entry_date = DATE '2026-10-24'
);

-- 3. Ronnie 5 Nov ₱1,000 cash advance: link it, book it to the advance asset, deduct on the 15th.
UPDATE expenses
SET employee_id = '3ac30508-e442-46c3-b7fa-b134e32241ea', category = 'Cash Advance', account_id = 'Employee-Advance'
WHERE id = '9b9577e1-c177-4dae-9863-fff635a79b73';

UPDATE journal_entries
SET account_id = 'Employee-Advance'
WHERE id = 'd1d3064d-11d5-4b8f-91a8-231f7e76d648';

INSERT INTO cash_advance_schedules (id, employee_id, expense_id, payday_type, granted_date, start_date, period_start, period_end,
                                    total_amount, remaining_balance, installment_amount, deduction_per_period, deducted)
SELECT gen_random_uuid()::text, '3ac30508-e442-46c3-b7fa-b134e32241ea', '9b9577e1-c177-4dae-9863-fff635a79b73', 'mid_month',
       DATE '2026-11-05', DATE '2026-11-05', DATE '2026-11-05', DATE '2026-11-05', 1000, 1000, 1000, 1000, false
WHERE NOT EXISTS (SELECT 1 FROM cash_advance_schedules WHERE expense_id = '9b9577e1-c177-4dae-9863-fff635a79b73');

-- 4. November fuel payouts are withdrawals against the allowance payable (the month-end accrual books the expense).
UPDATE expenses e
SET employee_id = v.employee_id
FROM (VALUES
  ('893581a8-18a3-4bf5-bd13-673dbc207890', 'b403b39a-07df-4748-bc64-3d2c997930f0'),
  ('28508593-cc14-4fc2-aa1d-6fdc051ba969', '3ac30508-e442-46c3-b7fa-b134e32241ea'),
  ('5e4e91f8-d729-40eb-aeba-1b2ab31e0552', 'ff481ff3-54d3-4b11-88f1-d7a7b9079a4a')
) v(expense_id, employee_id)
WHERE e.id = v.expense_id;

UPDATE journal_entries
SET account_id = 'VEHICLE-ALLOWANCE-PAYABLE'
WHERE id IN (
  'e1605b7c-b4ea-4559-9637-31624ccb1d22',
  '6799db9b-a629-42ad-b1ae-9d2a163f1ad8',
  '455f0e44-26a9-41f1-868f-8cf16aea5c04'
);

INSERT INTO employee_allowance_ledger (employee_id, entry_date, entry_type, amount, expense_id, journal_transaction_id, note)
SELECT v.employee_id, v.entry_date, 'withdrawal', v.amount, v.expense_id, v.tx, v.note
FROM (VALUES
  ('b403b39a-07df-4748-bc64-3d2c997930f0', DATE '2026-11-01', -500.00, '893581a8-18a3-4bf5-bd13-673dbc207890', 'ac5cebdf-1e81-47c3-bca5-28c098ea4ef6', 'Fuel allowance'),
  ('3ac30508-e442-46c3-b7fa-b134e32241ea', DATE '2026-11-04', -200.00, '28508593-cc14-4fc2-aa1d-6fdc051ba969', 'b9f03fc9-118e-4e29-8839-e4553ae7a47d', 'Fuel allowance'),
  ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', DATE '2026-11-06', -220.00, '5e4e91f8-d729-40eb-aeba-1b2ab31e0552', '4c61348e-de14-4af9-ba5d-91f1e9cc262c', 'Fuel')
) v(employee_id, entry_date, amount, expense_id, tx, note)
WHERE NOT EXISTS (SELECT 1 FROM employee_allowance_ledger l WHERE l.expense_id = v.expense_id);

-- 5. Manual 9pm payouts: attach the employee so the timesheet sync can replace them instead of paying twice.
UPDATE expenses e
SET employee_id = v.employee_id
FROM (VALUES
  ('1b663a87-1b61-465c-a741-34e0478bd41a', 'b403b39a-07df-4748-bc64-3d2c997930f0'),
  ('bf7bc60f-f75d-4700-b03d-989c0bf7a750', 'b403b39a-07df-4748-bc64-3d2c997930f0'),
  ('b7d7cd6b-3b49-4d8a-bcc7-d48b561f9b6e', 'b403b39a-07df-4748-bc64-3d2c997930f0'),
  ('d6dee5f1-c381-4da3-9395-5657d54d33eb', 'b403b39a-07df-4748-bc64-3d2c997930f0'),
  ('9bb58b7f-dd80-4765-82fa-19dc63fe5103', '3ac30508-e442-46c3-b7fa-b134e32241ea')
) v(expense_id, employee_id)
WHERE e.id = v.expense_id;
