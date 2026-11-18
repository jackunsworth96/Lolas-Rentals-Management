-- The reception tablet needs an employee row to sign in, but it is not a person.
-- 'counter' keeps it out of every staff-only list (rota, payroll, timesheets, HR),
-- which all filter on person_type = 'staff'.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_person_type_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_person_type_check CHECK (person_type IN ('staff', 'owner', 'developer', 'counter'));

UPDATE employees e
SET person_type = 'counter', role = 'Counter tablet', basic_rate = 0, rate_type = NULL, updated_at = now()
FROM users u
WHERE u.employee_id = e.id AND u.role_id = 'role-counter';
