-- Late return assignment: one record per store per date
CREATE TABLE IF NOT EXISTS public.late_return_assignments (
  id           serial PRIMARY KEY,
  store_id     text NOT NULL REFERENCES public.stores(id),
  date         date NOT NULL,
  employee_id  text NOT NULL REFERENCES public.employees(id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);

ALTER TABLE public.late_return_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY late_return_assignments_all ON public.late_return_assignments FOR ALL USING (true);

-- employees.default_payment_method (added in prior session, idempotent guard)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS default_payment_method text NOT NULL DEFAULT 'cash'
    CHECK (default_payment_method IN ('cash', 'gcash', 'bank_transfer'));
