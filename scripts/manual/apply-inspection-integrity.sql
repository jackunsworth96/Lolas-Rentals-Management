-- Manual installation only. This file is intentionally outside supabase/migrations.
-- Run against a backed-up staging database before production. Do not record it in
-- supabase_migrations.schema_migrations.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('lolas:apply-inspection-integrity:v1'));

DO $preflight$
DECLARE
  missing_columns text;
BEGIN
  IF to_regclass('public.inspections') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.inspections does not exist';
  END IF;

  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (VALUES ('order_id'), ('order_reference'), ('customer_id')) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'inspections'
      AND c.column_name = required.column_name
      AND c.data_type = 'text'
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Preflight failed: inspections columns are missing or not text: %', missing_columns;
  END IF;

  IF EXISTS (
    SELECT order_id
    FROM public.inspections
    WHERE order_id IS NOT NULL
    GROUP BY order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Preflight failed: duplicate non-null inspections.order_id values exist';
  END IF;

  IF EXISTS (
    SELECT order_reference
    FROM public.inspections
    WHERE order_reference IS NOT NULL
    GROUP BY order_reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Preflight failed: duplicate non-null inspections.order_reference values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inspections
    WHERE order_id IS NULL AND order_reference IS NULL AND customer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Preflight failed: inspections without an order, booking reference, or customer exist';
  END IF;
END
$preflight$;

ALTER TABLE public.inspections
  ALTER COLUMN order_reference DROP NOT NULL;

DO $constraint$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inspections'::regclass
      AND conname = 'inspections_context_required'
      AND contype <> 'c'
  ) THEN
    RAISE EXCEPTION 'Installation failed: inspections_context_required exists but is not a check constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inspections'::regclass
      AND conname = 'inspections_context_required'
  ) THEN
    ALTER TABLE public.inspections
      ADD CONSTRAINT inspections_context_required
      CHECK (num_nonnulls(order_id, order_reference, customer_id) >= 1)
      NOT VALID;
  END IF;
END
$constraint$;

ALTER TABLE public.inspections
  VALIDATE CONSTRAINT inspections_context_required;

CREATE UNIQUE INDEX IF NOT EXISTS inspections_unique_order_id
  ON public.inspections (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inspections_unique_order_reference
  ON public.inspections (order_reference)
  WHERE order_reference IS NOT NULL;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = 'public.inspections_unique_order_id'::regclass
      AND indrelid = 'public.inspections'::regclass
      AND indisunique
      AND indisvalid
      AND indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verification failed: inspections_unique_order_id is not a valid partial unique index';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = 'public.inspections_unique_order_reference'::regclass
      AND indrelid = 'public.inspections'::regclass
      AND indisunique
      AND indisvalid
      AND indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verification failed: inspections_unique_order_reference is not a valid partial unique index';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inspections'
      AND column_name = 'order_reference'
      AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'Verification failed: inspections.order_reference is still required';
  END IF;
END
$verify$;

COMMIT;

SELECT
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'inspections'
  AND c.column_name IN ('order_id', 'order_reference', 'customer_id')
ORDER BY c.column_name;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'inspections'
  AND indexname IN ('inspections_unique_order_id', 'inspections_unique_order_reference')
ORDER BY indexname;
