-- ============================================================
-- Junction table: employee_stores
-- Allows an employee to belong to multiple stores.
-- employees.store_id is kept for backwards compatibility.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_stores (
  employee_id text NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id    text NOT NULL REFERENCES public.stores(id)    ON DELETE CASCADE,
  PRIMARY KEY (employee_id, store_id)
);

ALTER TABLE public.employee_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage employee stores"
  ON public.employee_stores FOR ALL
  USING (store_id = ANY(user_store_ids()));

-- Backfill: migrate existing single-store assignments into the junction table.
INSERT INTO public.employee_stores (employee_id, store_id)
SELECT id, store_id
FROM public.employees
WHERE store_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- employees.store_id is intentionally kept (do not drop).
-- Code now reads store assignments from employee_stores instead.
