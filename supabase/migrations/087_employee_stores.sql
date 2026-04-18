-- Migration 087: employee_stores junction table for multi-store employee support
CREATE TABLE IF NOT EXISTS public.employee_stores (
  employee_id text NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id    text NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, store_id)
);

ALTER TABLE public.employee_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage employee stores"
  ON public.employee_stores FOR ALL
  USING (store_id = ANY(user_store_ids()));

-- Migrate existing single store assignments into the junction table
INSERT INTO public.employee_stores (employee_id, store_id)
SELECT id, store_id FROM public.employees
WHERE store_id IS NOT NULL
ON CONFLICT DO NOTHING;
