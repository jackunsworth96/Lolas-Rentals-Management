-- ============================================================
-- 119: post_batch_depreciation RPC
--
-- Replaces the previous batch-depreciation use case (per-vehicle
-- fleet UPDATE + separate journal insert) with one atomic
-- transaction: all fleet row updates and two GL legs succeed or
-- the whole action rolls back.
-- ============================================================

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
  rec         jsonb;
  v_tx_id     text;
  v_debit_id  text;
  v_credit_id text;
  v_total     numeric(14,2) := 0;
  v_count     integer := 0;
  v_affected  integer;
  v_d_amount  numeric(12,2);
BEGIN
  IF p_vehicle_records IS NULL
     OR jsonb_typeof(p_vehicle_records) != 'array'
     OR jsonb_array_length(p_vehicle_records) = 0 THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_vehicle_records must be a non-empty json array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_store_id IS NULL OR btrim(p_store_id) = '' THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_store_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_period IS NULL OR btrim(p_period) = '' THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_period is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_depreciation_expense_account_id IS NULL OR btrim(p_depreciation_expense_account_id) = '' THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_depreciation_expense_account_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_acc_depreciation_account_id IS NULL OR btrim(p_acc_depreciation_account_id) = '' THEN
    RAISE EXCEPTION 'post_batch_depreciation: p_acc_depreciation_account_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. Apply each vehicle depreciation row; sum amounts for the journal.
  FOR rec IN SELECT * FROM jsonb_array_elements(p_vehicle_records) LOOP
    IF rec->>'vehicle_id' IS NULL OR btrim(rec->>'vehicle_id') = '' THEN
      RAISE EXCEPTION 'post_batch_depreciation: each record must have vehicle_id'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_d_amount := COALESCE((rec->>'depreciation_amount')::numeric(12,2), 0);
    IF v_d_amount <= 0 THEN
      RAISE EXCEPTION 'post_batch_depreciation: depreciation_amount must be positive for vehicle %',
        (rec->>'vehicle_id')
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.fleet
    SET
      accumulated_depreciation = (rec->>'new_accumulated_depreciation')::numeric(12,2),
      book_value               = (rec->>'new_book_value')::numeric(12,2),
      updated_at               = now()
    WHERE id = (rec->>'vehicle_id')::text;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'post_batch_depreciation: fleet row not found for id %',
        (rec->>'vehicle_id')
        USING ERRCODE = 'no_data_found';
    END IF;

    v_total := v_total + v_d_amount;
    v_count := v_count + 1;
  END LOOP;

  IF v_total IS NULL OR round(v_total, 2) <= 0 THEN
    RAISE EXCEPTION 'post_batch_depreciation: total depreciation must be positive'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Post balanced GL entry (debit expense, credit accumulated depreciation).
  v_tx_id := gen_random_uuid()::text;
  v_debit_id := gen_random_uuid()::text;
  v_credit_id := gen_random_uuid()::text;

  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, description, debit, credit,
    reference_type, reference_id
  ) VALUES (
    v_debit_id,
    v_tx_id,
    p_period,
    p_journal_entry_date,
    p_store_id,
    p_depreciation_expense_account_id,
    format('Monthly depreciation %s (%s vehicles)', p_period, v_count::text),
    v_total,
    0,
    'depreciation',
    p_period
  );

  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id,
    account_id, description, debit, credit,
    reference_type, reference_id
  ) VALUES (
    v_credit_id,
    v_tx_id,
    p_period,
    p_journal_entry_date,
    p_store_id,
    p_acc_depreciation_account_id,
    format('Accumulated depreciation %s (%s vehicles)', p_period, v_count::text),
    0,
    v_total,
    'depreciation',
    p_period
  );

  RETURN jsonb_build_object(
    'transaction_id',     v_tx_id,
    'debit_entry_id',   v_debit_id,
    'credit_entry_id',  v_credit_id,
    'vehicle_count',    v_count,
    'total_depreciation', to_jsonb(v_total)
  );
END;
$$;

-- ============================================================
-- Service role only (same pattern as other posting RPCs).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.post_batch_depreciation(
  jsonb, date, text, text, text, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.post_batch_depreciation(
  jsonb, date, text, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.post_batch_depreciation(
  jsonb, date, text, text, text, text
) TO service_role;
