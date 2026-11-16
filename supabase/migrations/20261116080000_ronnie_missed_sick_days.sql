-- Ronnie was off sick on 2 and 13 Sep 2026 but no timesheet was logged (manager admin error).
-- Add them as Sick days so his sick balance drops 7 → 5. Marked Paid so a September re-run can't
-- pay them again; the ₱1,000 (2 × ₱500 September daily rate) is paid as a noted bonus on the
-- 1–15 Nov 2026 payslip.

DO $$
DECLARE
  v_emp text := '3ac30508-e442-46c3-b7fa-b134e32241ea';
  v_used int;
BEGIN
  IF EXISTS (SELECT 1 FROM timesheets WHERE employee_id = v_emp AND date IN ('2026-09-02', '2026-09-13')) THEN
    RAISE EXCEPTION 'Ronnie already has a timesheet on 2 or 13 Sep';
  END IF;

  INSERT INTO timesheets
    (id, date, employee_id, name, day_type, regular_hours, overtime_hours, nine_pm_returns_count,
     daily_notes, payroll_status, store_id, day_fraction)
  VALUES
    (gen_random_uuid(), '2026-09-02', v_emp, 'Ronnie Remedios', 'Sick', 8, 0, 0,
     'Sick day logged late (admin error). Paid on 1–15 Nov 2026 payslip.', 'Paid', 'store-lolas', 1),
    (gen_random_uuid(), '2026-09-13', v_emp, 'Ronnie Remedios', 'Sick', 8, 0, 0,
     'Sick day logged late (admin error). Paid on 1–15 Nov 2026 payslip.', 'Paid', 'store-lolas', 1);

  SELECT count(*) INTO v_used FROM timesheets
  WHERE employee_id = v_emp AND day_type = 'Sick' AND date >= '2026-01-01';
  UPDATE employees SET sick_used = v_used WHERE id = v_emp;

  IF v_used <> 2 THEN RAISE EXCEPTION 'Expected 2 sick days used, found %', v_used; END IF;
END $$;
