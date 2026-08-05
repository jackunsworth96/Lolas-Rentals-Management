-- Use purchase price as the vehicle depreciation basis and make monthly runs idempotent.

ALTER TABLE public.fleet_accounting_config
  ADD COLUMN IF NOT EXISTS setup_asset_account_id text
  REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.depreciation_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              text NOT NULL REFERENCES public.stores(id),
  period                text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  journal_entry_date    date NOT NULL,
  transaction_id        text,
  vehicle_count         integer NOT NULL DEFAULT 0,
  total_depreciation    numeric(14,2) NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, period)
);

CREATE TABLE IF NOT EXISTS public.depreciation_run_items (
  run_id                         uuid NOT NULL REFERENCES public.depreciation_runs(id) ON DELETE CASCADE,
  vehicle_id                     text NOT NULL REFERENCES public.fleet(id),
  period                         text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  depreciation_amount            numeric(12,2) NOT NULL CHECK (depreciation_amount > 0),
  new_accumulated_depreciation   numeric(12,2) NOT NULL,
  new_book_value                 numeric(12,2) NOT NULL,
  PRIMARY KEY (run_id, vehicle_id),
  UNIQUE (vehicle_id, period)
);

ALTER TABLE public.depreciation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depreciation_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY depreciation_runs_select ON public.depreciation_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY depreciation_run_items_select ON public.depreciation_run_items
  FOR SELECT TO authenticated USING (true);

-- Protect periods posted before this migration from being posted again.
INSERT INTO public.depreciation_runs (
  store_id, period, journal_entry_date, transaction_id,
  vehicle_count, total_depreciation, created_at
)
SELECT
  je.store_id,
  je.period,
  max(je.date),
  (array_agg(je.transaction_id ORDER BY je.date DESC, je.created_at DESC))[1],
  0,
  sum(je.debit),
  min(je.created_at)
FROM public.journal_entries je
WHERE je.reference_type = 'depreciation'
  AND je.period ~ '^[0-9]{4}-[0-9]{2}$'
GROUP BY je.store_id, je.period
ON CONFLICT (store_id, period) DO NOTHING;

CREATE OR REPLACE FUNCTION public.post_batch_depreciation(
  p_vehicle_records                 jsonb,
  p_journal_entry_date              date,
  p_store_id                        text,
  p_period                          text,
  p_depreciation_expense_account_id text,
  p_acc_depreciation_account_id     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           jsonb;
  v_run_id      uuid;
  v_tx_id       text;
  v_debit_id    text;
  v_credit_id   text;
  v_total       numeric(14,2) := 0;
  v_count       integer := 0;
  v_affected    integer;
  v_d_amount    numeric(12,2);
  v_existing    public.depreciation_runs%ROWTYPE;
BEGIN
  IF p_vehicle_records IS NULL OR jsonb_typeof(p_vehicle_records) != 'array'
     OR jsonb_array_length(p_vehicle_records) = 0 THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_vehicle_records must be a non-empty json array';
  END IF;
  IF p_store_id IS NULL OR btrim(p_store_id) = '' OR p_store_id = 'all' THEN
    RAISE EXCEPTION 'post_batch_depreciation: an individual store_id is required';
  END IF;
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'post_batch_depreciation: valid period is required';
  END IF;
  IF p_depreciation_expense_account_id IS NULL OR btrim(p_depreciation_expense_account_id) = ''
     OR p_acc_depreciation_account_id IS NULL OR btrim(p_acc_depreciation_account_id) = '' THEN
    RAISE EXCEPTION 'post_batch_depreciation: both depreciation accounts are required';
  END IF;

  INSERT INTO public.depreciation_runs (store_id, period, journal_entry_date)
  VALUES (p_store_id, p_period, p_journal_entry_date)
  ON CONFLICT (store_id, period) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT * INTO v_existing FROM public.depreciation_runs
    WHERE store_id = p_store_id AND period = p_period;
    RETURN jsonb_build_object(
      'run_id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'vehicle_count', v_existing.vehicle_count,
      'total_depreciation', v_existing.total_depreciation,
      'already_posted', true
    );
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_vehicle_records) LOOP
    v_d_amount := COALESCE((rec->>'depreciation_amount')::numeric(12,2), 0);
    IF rec->>'vehicle_id' IS NULL OR v_d_amount <= 0 THEN
      RAISE EXCEPTION 'post_batch_depreciation: invalid vehicle depreciation record';
    END IF;

    INSERT INTO public.depreciation_run_items (
      run_id, vehicle_id, period, depreciation_amount,
      new_accumulated_depreciation, new_book_value
    ) VALUES (
      v_run_id, rec->>'vehicle_id', p_period, v_d_amount,
      (rec->>'new_accumulated_depreciation')::numeric(12,2),
      (rec->>'new_book_value')::numeric(12,2)
    );

    UPDATE public.fleet SET
      accumulated_depreciation = (rec->>'new_accumulated_depreciation')::numeric(12,2),
      book_value = (rec->>'new_book_value')::numeric(12,2),
      updated_at = now()
    WHERE id = rec->>'vehicle_id' AND store_id = p_store_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'post_batch_depreciation: fleet row not found in store for id %', rec->>'vehicle_id';
    END IF;

    v_total := v_total + v_d_amount;
    v_count := v_count + 1;
  END LOOP;

  v_tx_id := gen_random_uuid()::text;
  v_debit_id := gen_random_uuid()::text;
  v_credit_id := gen_random_uuid()::text;

  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id, account_id, description,
    debit, credit, reference_type, reference_id
  ) VALUES
  (v_debit_id, v_tx_id, p_period, p_journal_entry_date, p_store_id,
   p_depreciation_expense_account_id, format('Monthly depreciation %s (%s vehicles)', p_period, v_count),
   v_total, 0, 'depreciation', p_period),
  (v_credit_id, v_tx_id, p_period, p_journal_entry_date, p_store_id,
   p_acc_depreciation_account_id, format('Accumulated depreciation %s (%s vehicles)', p_period, v_count),
   0, v_total, 'depreciation', p_period);

  UPDATE public.depreciation_runs SET
    transaction_id = v_tx_id,
    vehicle_count = v_count,
    total_depreciation = v_total
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'transaction_id', v_tx_id,
    'vehicle_count', v_count,
    'total_depreciation', v_total,
    'already_posted', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_batch_depreciation(jsonb, date, text, text, text, text)
  FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.post_batch_depreciation(jsonb, date, text, text, text, text)
  TO service_role;
