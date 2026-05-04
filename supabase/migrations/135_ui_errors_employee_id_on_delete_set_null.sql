-- Allow deleting employees without failing on logged UI errors; keep the error rows.

ALTER TABLE public.ui_errors
  DROP CONSTRAINT IF EXISTS ui_errors_employee_id_fkey;

ALTER TABLE public.ui_errors
  ADD CONSTRAINT ui_errors_employee_id_fkey
    FOREIGN KEY (employee_id)
    REFERENCES public.employees(id)
    ON DELETE SET NULL;
