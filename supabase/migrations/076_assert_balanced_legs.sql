-- ============================================================
-- 076: assert_balanced_legs helper
-- Used by every posting RPC to guarantee sum(debit) = sum(credit).
-- ============================================================

CREATE OR REPLACE FUNCTION public.assert_balanced_legs(p_legs jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_debit_total  numeric(14,2) := 0;
  v_credit_total numeric(14,2) := 0;
  leg jsonb;
BEGIN
  IF p_legs IS NULL OR jsonb_array_length(p_legs) = 0 THEN
    RETURN;
  END IF;

  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_debit_total  := v_debit_total  + COALESCE((leg->>'debit')::numeric,  0);
    v_credit_total := v_credit_total + COALESCE((leg->>'credit')::numeric, 0);
  END LOOP;

  IF round(v_debit_total, 2) <> round(v_credit_total, 2) THEN
    RAISE EXCEPTION 'Unbalanced journal legs: debit=% credit=%',
      v_debit_total, v_credit_total
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_balanced_legs(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_balanced_legs(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.assert_balanced_legs(jsonb) TO service_role;
