-- ============================================================
-- 054_budget.sql
-- P&L Budgeting module: budget_periods + budget_lines
-- ============================================================

-- ============================================================
-- TABLE: budget_periods
-- One row per store per year (or NULL store = company-wide).
-- ============================================================
CREATE TABLE public.budget_periods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    text        REFERENCES public.stores(id) ON DELETE CASCADE,
  year        integer     NOT NULL,
  notes       text,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One budget per store per year (for store-scoped budgets)
  CONSTRAINT budget_periods_store_year_unique UNIQUE (store_id, year)
);

-- One company-wide (store_id IS NULL) budget per year
CREATE UNIQUE INDEX budget_periods_company_wide_year_unique
  ON public.budget_periods (year)
  WHERE store_id IS NULL;

-- ============================================================
-- TABLE: budget_lines
-- Monthly budget figures per category/type within a period.
-- ============================================================
CREATE TABLE public.budget_lines (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_period_id    uuid          NOT NULL REFERENCES public.budget_periods(id) ON DELETE CASCADE,
  line_type           text          NOT NULL CHECK (line_type IN (
                                      'revenue',
                                      'expense',
                                      'payroll',
                                      'depreciation',
                                      'drawings',
                                      'transfer_revenue',
                                      'misc_revenue'
                                    )),
  category_label      text          NOT NULL,
  coa_account_id      text          REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  expense_category_id integer       REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  month               integer       NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount              numeric(12,2) NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  -- One entry per category per month within a period
  CONSTRAINT budget_lines_period_type_label_month_unique
    UNIQUE (budget_period_id, line_type, category_label, month)
);

-- Indexes for fast retrieval
CREATE INDEX idx_budget_lines_period
  ON public.budget_lines (budget_period_id);

CREATE INDEX idx_budget_lines_period_month
  ON public.budget_lines (budget_period_id, month);

-- ============================================================
-- TRIGGERS — updated_at auto-update
-- (008 bulk-created triggers only for tables existing at that
--  time; new tables require explicit trigger creation)
-- ============================================================
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.budget_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- API service role bypasses RLS; these policies mirror the
-- pattern used for other operational tables (053 etc.).
-- ============================================================
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_periods_all ON public.budget_periods
  FOR ALL USING (true);

ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_lines_all ON public.budget_lines
  FOR ALL USING (true);
