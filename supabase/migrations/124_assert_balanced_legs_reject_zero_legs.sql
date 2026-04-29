-- ============================================================
-- 124: Tighten assert_balanced_legs to reject zero-value legs
--
-- Previously the function only verified sum(debit) = sum(credit).
-- A leg with debit=0 and credit=0 would pass that check but then
-- fail the journal_entries.debit_xor_credit constraint on INSERT.
-- Now we raise an exception if any leg has both sides equal to zero
-- so the error is caught before any writes occur.
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
  leg            jsonb;
  v_debit        numeric(14,2);
  v_credit       numeric(14,2);
BEGIN
  IF p_legs IS NULL OR jsonb_array_length(p_legs) = 0 THEN
    RETURN;
  END IF;

  FOR leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_debit  := COALESCE((leg->>'debit')::numeric,  0);
    v_credit := COALESCE((leg->>'credit')::numeric, 0);

    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION
        'Invalid journal leg for account %: both debit and credit are zero',
        leg->>'account_id'
        USING ERRCODE = 'check_violation';
    END IF;

    v_debit_total  := v_debit_total  + v_debit;
    v_credit_total := v_credit_total + v_credit;
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
