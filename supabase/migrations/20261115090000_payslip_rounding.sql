-- Round-up of net pay to the next whole peso, shown as its own earnings line on the payslip.
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS rounding numeric(12,2) NOT NULL DEFAULT 0;

-- Teach run_payroll_v2 to store it: patch the live definition rather than restating the whole function.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.run_payroll_v2(jsonb,jsonb,text[],jsonb)'::regprocedure);
  v_new text;
BEGIN
  IF position('rounding' in v_def) > 0 THEN
    RETURN;
  END IF;
  v_new := replace(
    v_def,
    'rate_snapshot, day_lines, warnings,',
    'rate_snapshot, day_lines, warnings, rounding,'
  );
  v_new := replace(
    v_new,
    'coalesce(slip->''warnings'', ''[]''::jsonb),',
    'coalesce(slip->''warnings'', ''[]''::jsonb), coalesce((slip->>''rounding'')::numeric, 0),'
  );
  IF (length(v_new) - length(v_def)) <> length(' rounding,') + length(' coalesce((slip->>''rounding'')::numeric, 0),') THEN
    RAISE EXCEPTION 'run_payroll_v2 did not match the expected shape; rounding not added';
  END IF;
  EXECUTE v_new;
END $$;
