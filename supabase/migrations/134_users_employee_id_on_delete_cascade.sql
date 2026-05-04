-- When an employee is removed, drop their PIN login row as well (public.users links 1:1).
-- Previously users_employee_id_fkey defaulted to NO ACTION, which blocked employee deletes.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_employee_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_employee_id_fkey
    FOREIGN KEY (employee_id)
    REFERENCES public.employees(id)
    ON DELETE CASCADE;
