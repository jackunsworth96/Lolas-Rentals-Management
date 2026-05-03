-- ============================================================
-- FLEET ACCOUNTING CONFIG — per-store default account mappings
-- Stores the GL accounts used by fleet asset transactions so
-- users never have to select them manually at the point of entry.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fleet_accounting_config (
  store_id                       text        NOT NULL PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  fixed_asset_account_id         text        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  acc_depreciation_account_id    text        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  depreciation_expense_account_id text       REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  gain_loss_account_id           text        REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_accounting_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fleet accounting config"
  ON public.fleet_accounting_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert fleet accounting config"
  ON public.fleet_accounting_config FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
