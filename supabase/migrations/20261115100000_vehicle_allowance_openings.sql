-- Bike allowance balances as of 15 Nov 2026, from the spreadsheet:
--   Nitz   used 220, remaining 345
--   Reland used 500, remaining  35
--   Ronnie used 500, remaining   0
-- Opening amounts = remaining + already withdrawn this month.
-- Every statement is guarded so re-running is a no-op.

-- 1. Ronnie 7 Nov ₱300 was paid from the till as "Fuel". Reclassify as a
--    vehicle-allowance withdrawal so it comes off his balance, not business fuel.
UPDATE expenses
SET category = 'Staff Vehicle Allowance',
    account_id = 'EXP-VEH-ALLOWANCE-store-lolas',
    employee_id = '3ac30508-e442-46c3-b7fa-b134e32241ea',
    description = 'Ronnie fuel allowance'
WHERE id = '554df4cb-c087-4d04-a382-b11d04163d17'
  AND category = 'Fuel';

UPDATE journal_entries
SET account_id = 'VEHICLE-ALLOWANCE-PAYABLE',
    description = 'Staff Vehicle Allowance: Ronnie fuel allowance'
WHERE id = 'a7132a5a-6a4d-4a02-b433-1ed56d0a470a'
  AND account_id = 'EXP-FUEL-store-lolas';

UPDATE journal_entries
SET description = 'Staff Vehicle Allowance: Ronnie fuel allowance'
WHERE id = 'fad3440d-9744-4b83-b7df-e934d60a30d1'
  AND description = 'Fuel: Ronnie fuel';

INSERT INTO employee_allowance_ledger (employee_id, entry_date, entry_type, amount, expense_id, journal_transaction_id, note)
SELECT '3ac30508-e442-46c3-b7fa-b134e32241ea', DATE '2026-11-07', 'withdrawal', -300,
       '554df4cb-c087-4d04-a382-b11d04163d17', 'bb064974-8285-4cdc-ae8c-7bc75385651f', 'Fuel allowance'
WHERE NOT EXISTS (
  SELECT 1 FROM employee_allowance_ledger l
  WHERE l.expense_id = '554df4cb-c087-4d04-a382-b11d04163d17'
);

-- 2. Carry-over openings so remaining matches the spreadsheet after this month's fuel.
--    Nitz 565 - 220 = 345; Reland 535 - 500 = 35; Ronnie 500 - 200 - 300 = 0.
SELECT adjust_vehicle_allowance(jsonb_build_object(
  'employeeId', v.id,
  'employeeName', e.full_name,
  'storeId', 'store-lolas',
  'date', '2026-11-01',
  'amount', v.amt,
  'entryType', 'opening',
  'note', 'Opening balance carried over from the spreadsheet',
  'expenseAccountId', 'EXP-VEH-ALLOWANCE-store-lolas',
  'payableAccountId', 'VEHICLE-ALLOWANCE-PAYABLE',
  'createdBy', null,
  'transactionId', gen_random_uuid()::text,
  'legIds', jsonb_build_array(gen_random_uuid()::text, gen_random_uuid()::text)
))
FROM (VALUES
  ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 565),
  ('b403b39a-07df-4748-bc64-3d2c997930f0', 535),
  ('3ac30508-e442-46c3-b7fa-b134e32241ea', 500)
) v(id, amt)
JOIN employees e ON e.id = v.id
WHERE NOT EXISTS (
  SELECT 1 FROM employee_allowance_ledger l
  WHERE l.employee_id = v.id
    AND l.entry_type = 'opening'
    AND l.entry_date = DATE '2026-11-01'
    AND l.note = 'Opening balance carried over from the spreadsheet'
);
