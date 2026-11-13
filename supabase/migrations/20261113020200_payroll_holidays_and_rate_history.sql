-- ============================================================
-- Holiday calendar and pay-rate history.
--
-- public_holidays: dates the business marks as paid holidays. Days worked
-- on a marked date earn the premium (30% special, 100% regular) on top of
-- the day's pay. store_id NULL applies to every store.
--
-- employee_rate_history: every pay-rate change with the date it applies
-- from, so payroll can price each day at the rate in force on that date
-- and a mid-period raise splits correctly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  date NOT NULL,
  name          text NOT NULL,
  premium_pct   numeric(5,2) NOT NULL CHECK (premium_pct >= 0 AND premium_pct <= 200),
  store_id      text REFERENCES public.stores(id),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS public_holidays_date_store_unique
  ON public.public_holidays (holiday_date, coalesce(store_id, '*'));
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.employee_rate_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         text NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from      date NOT NULL,
  rate_type           text,
  basic_rate          numeric(12,2) NOT NULL DEFAULT 0,
  overtime_rate       numeric(12,2) NOT NULL DEFAULT 0,
  nine_pm_bonus_rate  numeric(12,2) NOT NULL DEFAULT 0,
  commission_rate     numeric(8,4) NOT NULL DEFAULT 0,
  note                text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_rate_history_unique UNIQUE (employee_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_rate_history_employee ON public.employee_rate_history (employee_id, effective_from DESC);
ALTER TABLE public.employee_rate_history ENABLE ROW LEVEL SECURITY;

-- Seed every employee's current rate as their starting rate.
INSERT INTO public.employee_rate_history (
  employee_id, effective_from, rate_type, basic_rate, overtime_rate, nine_pm_bonus_rate, commission_rate, note
)
SELECT e.id, coalesce(e.start_date, DATE '2000-01-01'), e.rate_type,
       coalesce(e.basic_rate, 0), coalesce(e.overtime_rate, 0),
       coalesce(e.nine_pm_bonus_rate, 0), coalesce(e.commission_rate, 0),
       'Starting rate'
FROM public.employees e
WHERE NOT EXISTS (SELECT 1 FROM public.employee_rate_history h WHERE h.employee_id = e.id);
