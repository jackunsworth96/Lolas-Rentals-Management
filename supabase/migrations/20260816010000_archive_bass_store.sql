-- Permanently retire Bass Bikes while preserving all historical records.
UPDATE public.stores
SET is_active = false,
    public_booking_enabled = false,
    updated_at = now()
WHERE id = 'store-bass';

-- Accounts attached exclusively to Bass can no longer enter the live backoffice.
UPDATE public.users AS u
SET is_active = false,
    updated_at = now()
WHERE u.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.employees AS e
    WHERE e.id = u.employee_id
      AND (
        e.store_id = 'store-bass'
        OR EXISTS (
          SELECT 1 FROM public.employee_stores AS es
          WHERE es.employee_id = e.id AND es.store_id = 'store-bass'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_stores AS es
        WHERE es.employee_id = e.id AND es.store_id <> 'store-bass'
      )
      AND (e.store_id IS NULL OR e.store_id = 'store-bass')
  );

-- Database-level backstop: any table directly scoped by store_id becomes
-- read-only for archived stores, including writes from jobs and service clients.
CREATE OR REPLACE FUNCTION public.reject_archived_store_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_store_id text;
BEGIN
  target_store_id := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'store_id'
    ELSE to_jsonb(NEW)->>'store_id'
  END;

  IF target_store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = target_store_id AND s.is_active = false
  ) THEN
    RAISE EXCEPTION 'STORE_ARCHIVED: archived stores are read-only'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  table_row record;
  trigger_name text;
BEGIN
  FOR table_row IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns AS c
    JOIN information_schema.tables AS t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'store_id'
      AND c.table_name <> 'stores'
  LOOP
    trigger_name := 'reject_archived_store_write_' || table_row.table_name;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, table_row.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_archived_store_write()',
      trigger_name,
      table_row.table_name
    );
  END LOOP;
END;
$$;
