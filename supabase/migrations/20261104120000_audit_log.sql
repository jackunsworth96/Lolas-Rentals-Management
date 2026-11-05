-- ============================================================
-- Shared append-only audit trail.
--
-- One table records every insert, update and delete on audited tables,
-- plus explicit events such as viewing a customer ID. Rows cannot be
-- updated, deleted or truncated through the app, and each row carries a
-- SHA-256 hash chained to the previous row, so an edit made outside the
-- app (e.g. by the database owner) shows up in audit_log_verify().
--
-- The acting staff member comes from the x-actor-employee-id and
-- x-actor-user-id request headers, which the API sets on every
-- authenticated request. Changes from cron jobs or public pages have no
-- actor and are identified by db_role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seq               bigint NOT NULL UNIQUE,
  occurred_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  table_name        text NOT NULL,
  row_id            text,
  action            text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT')),
  actor_employee_id text,
  actor_user_id     text,
  db_role           text NOT NULL,
  changed_fields    text[],
  old_values        jsonb,
  new_values        jsonb,
  note              text,
  prev_hash         text,
  row_hash          text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_row_idx ON public.audit_log (table_name, row_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_employee_id, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ── Hash chain ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_log_hash(r public.audit_log)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    r.seq::text,
    extract(epoch FROM r.occurred_at)::text,
    r.table_name,
    coalesce(r.row_id, ''),
    r.action,
    coalesce(r.actor_employee_id, ''),
    coalesce(r.actor_user_id, ''),
    r.db_role,
    coalesce(r.changed_fields::text, ''),
    coalesce(r.old_values::text, ''),
    coalesce(r.new_values::text, ''),
    coalesce(r.note, ''),
    coalesce(r.prev_hash, '')
  ), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.audit_log_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  last_row record;
BEGIN
  -- Serialise writers so seq and prev_hash form a single unbroken chain.
  PERFORM pg_advisory_xact_lock(hashtext('public.audit_log'));
  SELECT a.seq, a.row_hash INTO last_row FROM public.audit_log a ORDER BY a.seq DESC LIMIT 1;
  NEW.seq := coalesce(last_row.seq, 0) + 1;
  NEW.prev_hash := last_row.row_hash;
  NEW.occurred_at := clock_timestamp();
  -- current_user is the function owner here; the PostgREST role is in 'role'.
  NEW.db_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  NEW.row_hash := public.audit_log_hash(NEW);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_log_chain ON public.audit_log;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_chain();

-- ── Append-only ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_log_block_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_log_no_change ON public.audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_change();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_block_change();

REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM service_role;
GRANT SELECT ON public.audit_log TO service_role;

-- ── Actor from request headers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_actor(p_header text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> p_header, '')
$$;

-- ── Row change trigger ──────────────────────────────────────────────────────
-- Trigger arguments name columns whose values are replaced by a sha256
-- fingerprint (e.g. base64 signature images), keeping proof without bloat.

CREATE OR REPLACE FUNCTION public.audit_fingerprint(p_values jsonb, p_columns text[])
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  col text;
BEGIN
  IF p_values IS NULL OR p_columns IS NULL THEN RETURN p_values; END IF;
  FOREACH col IN ARRAY p_columns LOOP
    IF p_values ? col AND jsonb_typeof(p_values -> col) <> 'null' THEN
      p_values := jsonb_set(p_values, ARRAY[col],
        to_jsonb('sha256:' || encode(sha256(convert_to((p_values -> col)::text, 'UTF8')), 'hex')));
    END IF;
  END LOOP;
  RETURN p_values;
END $$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  old_j jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  new_j jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  rid text := coalesce(new_j ->> 'id', old_j ->> 'id');
  changed text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO changed
    FROM jsonb_each(new_j) n
    WHERE n.value IS DISTINCT FROM old_j -> n.key;
    IF changed IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_object_agg(k, old_j -> k), jsonb_object_agg(k, new_j -> k)
      INTO old_j, new_j
    FROM unnest(changed) k;
  END IF;

  IF TG_NARGS > 0 THEN
    old_j := public.audit_fingerprint(old_j, TG_ARGV::text[]);
    new_j := public.audit_fingerprint(new_j, TG_ARGV::text[]);
  END IF;

  INSERT INTO public.audit_log (
    table_name, row_id, action, actor_employee_id, actor_user_id,
    changed_fields, old_values, new_values, row_hash
  ) VALUES (
    TG_TABLE_NAME, rid, TG_OP,
    public.audit_actor('x-actor-employee-id'), public.audit_actor('x-actor-user-id'),
    changed, old_j, new_j, ''
  );
  RETURN NULL;
END $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_attach(p_table regclass, p_fingerprint_columns text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON %s', p_table);
  EXECUTE format(
    'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(%s)',
    p_table,
    coalesce((SELECT string_agg(quote_literal(c), ', ') FROM unnest(p_fingerprint_columns) c), '')
  );
END $$;

-- Explicit events that are not row changes, e.g. viewing or exporting a customer ID.
CREATE OR REPLACE FUNCTION public.audit_record_event(
  p_table text, p_row_id text, p_action text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_action NOT IN ('VIEW', 'EXPORT') THEN
    RAISE EXCEPTION 'audit_record_event only accepts VIEW or EXPORT, got %', p_action;
  END IF;
  INSERT INTO public.audit_log (table_name, row_id, action, actor_employee_id, actor_user_id, note, row_hash)
  VALUES (p_table, p_row_id, p_action,
    public.audit_actor('x-actor-employee-id'), public.audit_actor('x-actor-user-id'), p_note, '');
END $$;

-- Walks the chain and reports gaps, broken links and rows whose contents changed.
CREATE OR REPLACE FUNCTION public.audit_log_verify()
RETURNS TABLE (bad_seq bigint, problem text) LANGUAGE plpgsql STABLE AS $$
DECLARE
  r public.audit_log;
  prev text := NULL;
  expected bigint := 1;
BEGIN
  FOR r IN SELECT * FROM public.audit_log ORDER BY seq LOOP
    IF r.seq <> expected THEN
      bad_seq := r.seq; problem := format('rows %s to %s are missing', expected, r.seq - 1); RETURN NEXT;
    END IF;
    IF r.prev_hash IS DISTINCT FROM prev THEN
      bad_seq := r.seq; problem := 'link to the previous row is broken'; RETURN NEXT;
    END IF;
    IF r.row_hash <> public.audit_log_hash(r) THEN
      bad_seq := r.seq; problem := 'row contents were changed after it was written'; RETURN NEXT;
    END IF;
    prev := r.row_hash;
    expected := r.seq + 1;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.audit_attach(regclass, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.audit_record_event(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_record_event(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.audit_log_verify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log_verify() TO service_role;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_log_chain() FROM PUBLIC, anon, authenticated;

-- ── Audited tables ──────────────────────────────────────────────────────────

SELECT public.audit_attach('public.waivers', ARRAY['driver_signature_url', 'passenger_signatures']);
SELECT public.audit_attach('public.inspections', ARRAY['customer_signature_url']);
SELECT public.audit_attach('public.maintenance');
SELECT public.audit_attach('public.accident_reports', ARRAY['customer_signature_url']);
SELECT public.audit_attach('public.breakdown_reports');
SELECT public.audit_attach('public.todo_tasks');
SELECT public.audit_attach('public.todo_comments');
