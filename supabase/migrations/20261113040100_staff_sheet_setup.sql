-- Employee setup to match the Finance / Staff Record Keeping sheets (Nov 2026 import).

-- Start dates.
UPDATE employees SET start_date = DATE '2026-01-10' WHERE id = '3ac30508-e442-46c3-b7fa-b134e32241ea';
UPDATE employees SET start_date = DATE '2026-10-05' WHERE id = '43ae55f6-fe46-46d3-8652-b1424dc03d52';

-- Leave allowances: 18 holiday / 7 sick, as Reland.
UPDATE employees SET holiday_allowance = 18, sick_allowance = 7
WHERE id IN ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', '3ac30508-e442-46c3-b7fa-b134e32241ea');

-- Ronnie's daily rate through 2026 as paid on the Finance sheet.
UPDATE employee_rate_history SET basic_rate = 538.46, note = 'January 2026 rate (Finance sheet)'
WHERE employee_id = '3ac30508-e442-46c3-b7fa-b134e32241ea' AND effective_from = DATE '2000-01-01';

INSERT INTO employee_rate_history (employee_id, effective_from, rate_type, basic_rate, overtime_rate, nine_pm_bonus_rate, commission_rate, note)
SELECT '3ac30508-e442-46c3-b7fa-b134e32241ea', v.d, 'daily', v.rate, 0, 100, 0, 'From Finance sheet'
FROM (VALUES (DATE '2026-02-01', 461.54), (DATE '2026-05-01', 475.00), (DATE '2026-08-01', 500.00)) v(d, rate)
ON CONFLICT (employee_id, effective_from) DO UPDATE SET basic_rate = EXCLUDED.basic_rate;

-- Overtime is paid as an eighth of the day rate per hour (1.125 on the sheet = one extra hour).
UPDATE employee_rate_history
SET overtime_rate = round(basic_rate / 8, 2)
WHERE rate_type = 'daily'
  AND employee_id IN ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 'b403b39a-07df-4748-bc64-3d2c997930f0', '3ac30508-e442-46c3-b7fa-b134e32241ea');

UPDATE employees
SET overtime_rate = round(basic_rate / 8, 2)
WHERE id IN ('ff481ff3-54d3-4b11-88f1-d7a7b9079a4a', 'b403b39a-07df-4748-bc64-3d2c997930f0', '3ac30508-e442-46c3-b7fa-b134e32241ea');

-- Remaining 2026 Philippine public holidays (all stores).
INSERT INTO public_holidays (holiday_date, name, premium_pct)
SELECT v.d, v.name, v.pct
FROM (VALUES
  (DATE '2026-11-01', 'All Saints'' Day', 30),
  (DATE '2026-11-02', 'All Souls'' Day', 30),
  (DATE '2026-11-30', 'Bonifacio Day', 100),
  (DATE '2026-12-08', 'Feast of the Immaculate Conception', 30),
  (DATE '2026-12-24', 'Christmas Eve', 30),
  (DATE '2026-12-25', 'Christmas Day', 100),
  (DATE '2026-12-30', 'Rizal Day', 100),
  (DATE '2026-12-31', 'Last Day of the Year', 30)
) v(d, name, pct)
WHERE NOT EXISTS (SELECT 1 FROM public_holidays h WHERE h.holiday_date = v.d AND h.store_id IS NULL);
