-- Manual Xendit database installation for Lola's Rentals.
--
-- This file is intentionally outside supabase/migrations. Run it explicitly in
-- the Supabase SQL Editor or with:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/manual/apply-xendit-schema.sql
--
-- Apply to staging first. This script does not write to
-- supabase_migrations.schema_migrations.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(hashtext('lolas_manual_xendit_schema_v1'));

DO $preflight$
DECLARE
  missing_relations text;
  mismatch record;
  existing_table record;
  missing_columns text;
  problem_exists boolean;
  admin_role_count integer;
BEGIN
  SELECT string_agg(required.relation_name, ', ' ORDER BY required.relation_name)
  INTO missing_relations
  FROM (
    VALUES
      ('public.card_settlements'),
      ('public.customers'),
      ('public.employees'),
      ('public.orders'),
      ('public.orders_raw'),
      ('public.payment_methods'),
      ('public.payments'),
      ('public.role_permissions'),
      ('public.roles'),
      ('public.stores')
  ) AS required(relation_name)
  WHERE to_regclass(required.relation_name) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'Xendit installation aborted. Required relations are missing: %',
      missing_relations;
  END IF;

  FOR mismatch IN
    SELECT
      expected.table_name,
      expected.column_name,
      expected.data_type AS expected_type,
      columns.data_type AS actual_type
    FROM (
      VALUES
        ('card_settlements', 'id', 'text'),
        ('card_settlements', 'payment_id', 'text'),
        ('card_settlements', 'store_id', 'text'),
        ('card_settlements', 'order_id', 'text'),
        ('card_settlements', 'customer_id', 'text'),
        ('customers', 'id', 'text'),
        ('customers', 'name', 'text'),
        ('employees', 'id', 'text'),
        ('orders', 'id', 'text'),
        ('orders', 'store_id', 'text'),
        ('orders', 'customer_id', 'text'),
        ('orders', 'status', 'text'),
        ('orders', 'final_total', 'numeric'),
        ('orders', 'card_fee_surcharge', 'numeric'),
        ('orders', 'balance_due', 'numeric'),
        ('orders_raw', 'id', 'uuid'),
        ('payment_methods', 'id', 'text'),
        ('payment_methods', 'name', 'text'),
        ('payment_methods', 'is_deposit_eligible', 'boolean'),
        ('payment_methods', 'is_active', 'boolean'),
        ('payment_methods', 'surcharge_percent', 'numeric'),
        ('payment_methods', 'show_on_customer_website', 'boolean'),
        ('payments', 'id', 'text'),
        ('payments', 'store_id', 'text'),
        ('payments', 'order_id', 'text'),
        ('payments', 'raw_order_id', 'uuid'),
        ('payments', 'payment_type', 'text'),
        ('payments', 'amount', 'numeric'),
        ('payments', 'payment_method_id', 'text'),
        ('payments', 'transaction_date', 'date'),
        ('payments', 'settlement_status', 'text'),
        ('payments', 'settlement_ref', 'text'),
        ('payments', 'customer_id', 'text'),
        ('payments', 'created_at', 'timestamp with time zone'),
        ('role_permissions', 'role_id', 'text'),
        ('role_permissions', 'permission', 'text'),
        ('roles', 'id', 'text'),
        ('roles', 'name', 'text'),
        ('stores', 'id', 'text')
    ) AS expected(table_name, column_name, data_type)
    LEFT JOIN information_schema.columns AS columns
      ON columns.table_schema = 'public'
     AND columns.table_name = expected.table_name
     AND columns.column_name = expected.column_name
    WHERE columns.column_name IS NULL
       OR columns.data_type <> expected.data_type
  LOOP
    RAISE EXCEPTION
      'Xendit installation aborted. %.% must have type %, found %',
      mismatch.table_name,
      mismatch.column_name,
      mismatch.expected_type,
      COALESCE(mismatch.actual_type, 'missing');
  END LOOP;

  SELECT count(*)
  INTO admin_role_count
  FROM public.roles
  WHERE lower(name) = 'admin';

  IF admin_role_count <> 1 THEN
    RAISE EXCEPTION
      'Xendit installation aborted. Expected exactly one Admin role, found %',
      admin_role_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.card_settlements
    WHERE payment_id IS NOT NULL
    GROUP BY payment_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Xendit installation aborted. card_settlements contains duplicate non-null payment_id values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_methods'
      AND column_name = 'gateway_provider'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.payment_methods
      WHERE gateway_provider IS NOT NULL
        AND gateway_provider <> 'xendit'
    )
    INTO problem_exists;

    IF problem_exists THEN
      RAISE EXCEPTION
        'Xendit installation aborted. payment_methods.gateway_provider contains unsupported values';
    END IF;
  END IF;

  FOR existing_table IN
    SELECT *
    FROM (
      VALUES
        (
          'xendit_payment_sessions',
          ARRAY[
            'id', 'reference_id', 'payment_session_id', 'payment_request_id',
            'payment_id', 'target_type', 'order_id', 'store_id',
            'payment_method_id', 'principal_amount_php',
            'surcharge_amount_php', 'amount_php', 'currency', 'status',
            'payment_link_url', 'expires_at', 'created_by', 'completed_at',
            'processing_error', 'last_webhook_at', 'created_at', 'updated_at'
          ]::text[]
        ),
        (
          'xendit_payment_session_orders',
          ARRAY[
            'session_id', 'raw_order_id', 'principal_amount_php',
            'surcharge_amount_php', 'amount_php'
          ]::text[]
        ),
        (
          'xendit_webhook_events',
          ARRAY[
            'id', 'event_key', 'event_type', 'session_id', 'payload',
            'processing_status', 'processing_error', 'received_at', 'processed_at'
          ]::text[]
        ),
        (
          'xendit_payment_session_extension_payments',
          ARRAY[
            'session_id', 'extension_payment_id', 'principal_amount_php',
            'released_at', 'created_at'
          ]::text[]
        )
    ) AS expected(table_name, required_columns)
  LOOP
    IF to_regclass('public.' || existing_table.table_name) IS NOT NULL THEN
      SELECT string_agg(required_column, ', ' ORDER BY required_column)
      INTO missing_columns
      FROM unnest(existing_table.required_columns) AS required_column
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = existing_table.table_name
          AND column_name = required_column
      );

      IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION
          'Xendit installation aborted. Existing table public.% is incomplete; missing columns: %',
          existing_table.table_name,
          missing_columns;
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('public.xendit_payment_sessions') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.xendit_payment_sessions
      WHERE target_type NOT IN (
        'public_booking_group',
        'staff_order',
        'public_extension'
      )
         OR (
           target_type IN ('staff_order', 'public_extension')
           AND order_id IS NULL
         )
         OR (
           target_type = 'public_booking_group'
           AND order_id IS NOT NULL
         )
    )
    INTO problem_exists;

    IF problem_exists THEN
      RAISE EXCEPTION
        'Xendit installation aborted. Existing Xendit sessions violate the final target contract';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.xendit_payment_sessions
      WHERE order_id IS NOT NULL
        AND status IN ('creating', 'active')
      GROUP BY order_id
      HAVING count(*) > 1
    )
    INTO problem_exists;

    IF problem_exists THEN
      RAISE EXCEPTION
        'Xendit installation aborted. An order has multiple live Xendit sessions';
    END IF;
  END IF;

  IF to_regclass('public.xendit_payment_session_extension_payments') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.xendit_payment_session_extension_payments
      WHERE released_at IS NULL
      GROUP BY extension_payment_id
      HAVING count(*) > 1
    )
    INTO problem_exists;

    IF problem_exists THEN
      RAISE EXCEPTION
        'Xendit installation aborted. An extension payment has multiple live session claims';
    END IF;
  END IF;
END;
$preflight$;

-- --------------------------------------------------------------------------
-- Source: 20260804173708_xendit_payment_sessions.sql
-- --------------------------------------------------------------------------
-- ============================================================
-- Xendit hosted Payment Sessions
-- ============================================================

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS gateway_provider text;

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_gateway_provider_check;

ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_gateway_provider_check
  CHECK (gateway_provider IS NULL OR gateway_provider IN ('xendit'));

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS web_card_fee_surcharge numeric(12,2) NOT NULL DEFAULT 0;

INSERT INTO public.payment_methods (
  id, name, is_deposit_eligible, is_active, surcharge_percent,
  show_on_customer_website, gateway_provider
) VALUES (
  'xendit', 'Pay online', false, true, 0, true, 'xendit'
)
ON CONFLICT (id) DO UPDATE
SET gateway_provider = 'xendit';

CREATE TABLE IF NOT EXISTS public.xendit_payment_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id          text NOT NULL UNIQUE,
  payment_session_id    text UNIQUE,
  payment_request_id    text,
  payment_id            text UNIQUE,
  target_type           text NOT NULL CHECK (target_type IN ('public_booking_group', 'staff_order')),
  order_id              text REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id              text NOT NULL REFERENCES public.stores(id),
  payment_method_id     text NOT NULL REFERENCES public.payment_methods(id),
  principal_amount_php  numeric(12,2) NOT NULL CHECK (principal_amount_php > 0),
  surcharge_amount_php  numeric(12,2) NOT NULL DEFAULT 0 CHECK (surcharge_amount_php >= 0),
  amount_php            numeric(12,2) NOT NULL CHECK (amount_php > 0),
  currency              text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  status                text NOT NULL DEFAULT 'creating'
                        CHECK (status IN ('creating', 'active', 'completed', 'expired', 'cancelled', 'failed')),
  payment_link_url      text,
  expires_at            timestamptz,
  created_by            text REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at          timestamptz,
  processing_error      text,
  last_webhook_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xendit_session_amounts_match
    CHECK (amount_php = principal_amount_php + surcharge_amount_php),
  CONSTRAINT xendit_session_target_matches
    CHECK (
      (target_type = 'staff_order' AND order_id IS NOT NULL)
      OR (target_type = 'public_booking_group' AND order_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.xendit_payment_session_orders (
  session_id            uuid NOT NULL REFERENCES public.xendit_payment_sessions(id) ON DELETE CASCADE,
  raw_order_id          uuid NOT NULL REFERENCES public.orders_raw(id) ON DELETE RESTRICT,
  principal_amount_php  numeric(12,2) NOT NULL CHECK (principal_amount_php > 0),
  surcharge_amount_php  numeric(12,2) NOT NULL DEFAULT 0 CHECK (surcharge_amount_php >= 0),
  amount_php            numeric(12,2) NOT NULL CHECK (amount_php > 0),
  PRIMARY KEY (session_id, raw_order_id),
  CONSTRAINT xendit_session_order_amounts_match
    CHECK (amount_php = principal_amount_php + surcharge_amount_php)
);

ALTER TABLE public.orders_raw
  ADD COLUMN IF NOT EXISTS xendit_payment_session_id uuid
  REFERENCES public.xendit_payment_sessions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.xendit_webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key       text NOT NULL UNIQUE,
  event_type      text NOT NULL,
  session_id      uuid REFERENCES public.xendit_payment_sessions(id) ON DELETE SET NULL,
  payload         jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
                    CHECK (processing_status IN ('received', 'processed', 'rejected')),
  processing_error text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_xendit_sessions_status
  ON public.xendit_payment_sessions(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_active_staff_order
  ON public.xendit_payment_sessions(order_id)
  WHERE order_id IS NOT NULL AND status IN ('creating', 'active');

CREATE INDEX IF NOT EXISTS idx_xendit_session_orders_raw
  ON public.xendit_payment_session_orders(raw_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_card_settlements_payment
  ON public.card_settlements(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_xendit_card_settlement_on_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_customer_id text;
  order_customer_name text;
BEGIN
  IF NEW.payment_type <> 'card_xendit' OR NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.customer_id, c.name
  INTO order_customer_id, order_customer_name
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE o.id = NEW.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot create Xendit settlement: order % not found', NEW.order_id;
  END IF;

  INSERT INTO public.card_settlements (
    id, store_id, order_id, customer_id, payment_id, name, amount,
    ref_number, raw_date, is_paid
  ) VALUES (
    'CS-XENDIT-' || md5(NEW.id), NEW.store_id, NEW.order_id,
    order_customer_id, NEW.id, COALESCE(order_customer_name, 'Xendit'),
    NEW.amount, NEW.settlement_ref,
    NEW.transaction_date::text, false
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_create_xendit_card_settlement ON public.payments;
CREATE TRIGGER payments_create_xendit_card_settlement
AFTER INSERT OR UPDATE OF order_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.create_xendit_card_settlement_on_payment_link();

ALTER TABLE public.xendit_payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xendit_payment_session_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xendit_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.xendit_payment_sessions;
CREATE POLICY "Service role full access" ON public.xendit_payment_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.xendit_payment_session_orders;
CREATE POLICY "Service role full access" ON public.xendit_payment_session_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.xendit_webhook_events;
CREATE POLICY "Service role full access" ON public.xendit_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_xendit_session_draft(
  p_session_id uuid,
  p_reference_id text,
  p_target_type text,
  p_order_id text,
  p_store_id text,
  p_payment_method_id text,
  p_principal_amount_php numeric,
  p_surcharge_amount_php numeric,
  p_amount_php numeric,
  p_created_by text,
  p_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allocation jsonb;
  allocation_total numeric(12,2) := 0;
BEGIN
  IF p_amount_php <> p_principal_amount_php + p_surcharge_amount_php THEN
    RAISE EXCEPTION 'Xendit session amounts do not match';
  END IF;

  IF p_target_type = 'public_booking_group' THEN
    IF p_order_id IS NOT NULL OR jsonb_array_length(p_allocations) = 0 THEN
      RAISE EXCEPTION 'Public Xendit session requires raw-order allocations only';
    END IF;
  ELSIF p_target_type = 'staff_order' THEN
    IF p_order_id IS NULL OR jsonb_array_length(p_allocations) <> 0 THEN
      RAISE EXCEPTION 'Staff Xendit session requires one active order only';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported Xendit target type';
  END IF;

  INSERT INTO public.xendit_payment_sessions (
    id, reference_id, target_type, order_id, store_id, payment_method_id,
    principal_amount_php, surcharge_amount_php, amount_php, created_by
  ) VALUES (
    p_session_id, p_reference_id, p_target_type, p_order_id, p_store_id,
    p_payment_method_id, p_principal_amount_php, p_surcharge_amount_php,
    p_amount_php, p_created_by
  );

  FOR allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    UPDATE public.orders_raw
    SET xendit_payment_session_id = p_session_id
    WHERE id = (allocation->>'raw_order_id')::uuid
      AND xendit_payment_session_id IS NULL
      AND booking_channel = 'direct'
      AND status = 'unprocessed'
      AND store_id = p_store_id
      AND web_payment_method = p_payment_method_id
      AND EXISTS (
        SELECT 1 FROM public.payment_methods pm
        WHERE pm.id = p_payment_method_id
          AND pm.is_active = true
          AND pm.show_on_customer_website = true
          AND pm.gateway_provider = 'xendit'
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Raw order already has a Xendit payment session';
    END IF;

    INSERT INTO public.xendit_payment_session_orders (
      session_id, raw_order_id, principal_amount_php,
      surcharge_amount_php, amount_php
    ) VALUES (
      p_session_id,
      (allocation->>'raw_order_id')::uuid,
      (allocation->>'principal_amount_php')::numeric(12,2),
      (allocation->>'surcharge_amount_php')::numeric(12,2),
      (allocation->>'amount_php')::numeric(12,2)
    );
    allocation_total := allocation_total + (allocation->>'amount_php')::numeric(12,2);
  END LOOP;

  IF p_target_type = 'public_booking_group' AND allocation_total <> p_amount_php THEN
    RAISE EXCEPTION 'Xendit allocation total does not match session amount';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_xendit_session_without_payment(
  p_session_id uuid,
  p_status text,
  p_processing_error text DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  IF p_status NOT IN ('expired', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Unsupported Xendit terminal status';
  END IF;

  UPDATE public.xendit_payment_sessions
  SET status = p_status,
      processing_error = p_processing_error,
      last_webhook_at = CASE WHEN p_event_key IS NULL THEN last_webhook_at ELSE now() END,
      updated_at = now()
  WHERE id = p_session_id
    AND status <> 'completed';

  GET DIAGNOSTICS closed_count = ROW_COUNT;

  IF closed_count > 0 THEN
    UPDATE public.orders_raw
    SET xendit_payment_session_id = NULL
    WHERE xendit_payment_session_id = p_session_id;
  END IF;

  IF p_event_key IS NOT NULL AND p_event_type IS NOT NULL AND p_payload IS NOT NULL THEN
    INSERT INTO public.xendit_webhook_events (
      event_key, event_type, session_id, payload,
      processing_status, processing_error, processed_at
    ) VALUES (
      p_event_key, p_event_type, p_session_id, p_payload,
      'processed', p_processing_error, now()
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_xendit_session_atomic(
  p_session_id uuid,
  p_event_key text,
  p_event_type text,
  p_payload jsonb,
  p_payment_session_id text,
  p_payment_request_id text,
  p_payment_id text,
  p_amount_php numeric,
  p_currency text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row public.xendit_payment_sessions%ROWTYPE;
  allocation public.xendit_payment_session_orders%ROWTYPE;
  payment_row_id text;
  order_customer_id text;
BEGIN
  SELECT * INTO session_row
  FROM public.xendit_payment_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Xendit session not found';
  END IF;

  INSERT INTO public.xendit_webhook_events (
    event_key, event_type, session_id, payload, processing_status
  ) VALUES (
    p_event_key, p_event_type, p_session_id, p_payload, 'received'
  ) ON CONFLICT (event_key) DO NOTHING;

  IF session_row.status = 'completed' THEN
    UPDATE public.xendit_webhook_events
    SET processing_status = 'processed',
        processing_error = 'Duplicate completion event',
        processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF session_row.status NOT IN ('creating', 'active') THEN
    IF session_row.status IN ('failed', 'expired', 'cancelled') THEN
      UPDATE public.xendit_payment_sessions
      SET status = 'reconciliation_required',
          processing_error = 'Xendit completion arrived after local session closure',
          last_webhook_at = now(),
          updated_at = now()
      WHERE id = p_session_id;
    END IF;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected',
        processing_error = 'Session is already closed or requires reconciliation',
        processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF p_currency <> session_row.currency OR p_amount_php <> session_row.amount_php THEN
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected',
        processing_error = 'Amount or currency mismatch',
        processed_at = now()
    WHERE event_key = p_event_key;
    RAISE EXCEPTION 'Xendit amount or currency mismatch';
  END IF;

  IF session_row.payment_session_id IS NOT NULL
     AND session_row.payment_session_id <> p_payment_session_id THEN
    RAISE EXCEPTION 'Xendit payment session id mismatch';
  END IF;

  IF session_row.target_type = 'public_booking_group' THEN
    FOR allocation IN
      SELECT * FROM public.xendit_payment_session_orders
      WHERE session_id = p_session_id
      ORDER BY raw_order_id
    LOOP
      payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || allocation.raw_order_id::text);
      INSERT INTO public.payments (
        id, store_id, order_id, raw_order_id, payment_type, amount,
        payment_method_id, transaction_date, settlement_status,
        settlement_ref, created_at
      ) VALUES (
        payment_row_id, session_row.store_id, NULL, allocation.raw_order_id,
        'card_xendit', allocation.amount_php, session_row.payment_method_id,
        (now() AT TIME ZONE 'Asia/Manila')::date, 'pending', p_payment_id, now()
      ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
  ELSE
    payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || session_row.order_id);
    SELECT customer_id INTO order_customer_id
    FROM public.orders
    WHERE id = session_row.order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Xendit target order not found';
    END IF;

    INSERT INTO public.payments (
      id, store_id, order_id, raw_order_id, payment_type, amount,
      payment_method_id, transaction_date, settlement_status,
      settlement_ref, customer_id, created_at
    ) VALUES (
      payment_row_id, session_row.store_id, session_row.order_id, NULL,
      'card_xendit', session_row.amount_php, session_row.payment_method_id,
      (now() AT TIME ZONE 'Asia/Manila')::date, 'pending', p_payment_id,
      order_customer_id, now()
    ) ON CONFLICT (id) DO NOTHING;

    UPDATE public.orders
    SET final_total = COALESCE(final_total, 0) + session_row.surcharge_amount_php,
        card_fee_surcharge = COALESCE(card_fee_surcharge, 0) + session_row.surcharge_amount_php,
        balance_due = GREATEST(0, COALESCE(balance_due, 0) - session_row.principal_amount_php),
        updated_at = now()
    WHERE id = session_row.order_id;
  END IF;

  UPDATE public.xendit_payment_sessions
  SET payment_session_id = COALESCE(payment_session_id, p_payment_session_id),
      payment_request_id = p_payment_request_id,
      payment_id = p_payment_id,
      status = 'completed',
      completed_at = now(),
      last_webhook_at = now(),
      processing_error = NULL,
      updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.xendit_webhook_events
  SET processing_status = 'processed', processed_at = now()
  WHERE event_key = p_event_key;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_xendit_session_draft(
  uuid, text, text, text, text, text, numeric, numeric, numeric, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_session_draft(
  uuid, text, text, text, text, text, numeric, numeric, numeric, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_xendit_session_atomic(
  uuid, text, text, jsonb, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_atomic(
  uuid, text, text, jsonb, text, text, text, numeric, text
) TO service_role;

REVOKE ALL ON FUNCTION public.close_xendit_session_without_payment(
  uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_xendit_session_without_payment(
  uuid, text, text, text, text, jsonb
) TO service_role;

-- --------------------------------------------------------------------------
-- Source: 20260909000000_xendit_extension_payments.sql
-- --------------------------------------------------------------------------
-- ============================================================
-- Xendit payments for the public rental-extension flow
-- ============================================================

ALTER TABLE public.xendit_payment_sessions
  DROP CONSTRAINT IF EXISTS xendit_payment_sessions_target_type_check;

ALTER TABLE public.xendit_payment_sessions
  ADD CONSTRAINT xendit_payment_sessions_target_type_check
  CHECK (target_type IN ('public_booking_group', 'staff_order', 'public_extension'));

ALTER TABLE public.xendit_payment_sessions
  DROP CONSTRAINT IF EXISTS xendit_session_target_matches;

ALTER TABLE public.xendit_payment_sessions
  ADD CONSTRAINT xendit_session_target_matches
  CHECK (
    (target_type IN ('staff_order', 'public_extension') AND order_id IS NOT NULL)
    OR (target_type = 'public_booking_group' AND order_id IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.xendit_payment_session_extension_payments (
  session_id              uuid NOT NULL
                          REFERENCES public.xendit_payment_sessions(id) ON DELETE CASCADE,
  extension_payment_id    text NOT NULL
                          REFERENCES public.payments(id) ON DELETE RESTRICT,
  principal_amount_php    numeric(12,2) NOT NULL CHECK (principal_amount_php > 0),
  released_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, extension_payment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_live_extension_payment_claim
  ON public.xendit_payment_session_extension_payments(extension_payment_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_xendit_extension_payments_session
  ON public.xendit_payment_session_extension_payments(session_id);

ALTER TABLE public.xendit_payment_session_extension_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access"
  ON public.xendit_payment_session_extension_payments;
CREATE POLICY "Service role full access"
  ON public.xendit_payment_session_extension_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_xendit_extension_session_draft(
  p_session_id uuid,
  p_reference_id text,
  p_order_id text,
  p_payment_method_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_store_id text;
  surcharge_percent numeric := 0;
  extension_payment record;
  principal_amount numeric(12,2) := 0;
  surcharge_amount numeric(12,2) := 0;
  total_amount numeric(12,2) := 0;
  extension_count integer := 0;
BEGIN
  SELECT store_id
  INTO order_store_id
  FROM public.orders
  WHERE id = p_order_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active extension order not found';
  END IF;

  SELECT COALESCE(pm.surcharge_percent, 0)
  INTO surcharge_percent
  FROM public.payment_methods pm
  WHERE pm.id = p_payment_method_id
    AND pm.is_active = true
    AND pm.show_on_customer_website = true
    AND pm.gateway_provider = 'xendit';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Public Xendit payment method not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.xendit_payment_sessions s
    WHERE s.order_id = p_order_id
      AND s.status IN ('creating', 'active')
  ) THEN
    RAISE EXCEPTION 'Active Xendit session already exists for this order';
  END IF;

  FOR extension_payment IN
    SELECT p.id, p.amount
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.payment_type = 'extension'
      AND p.settlement_status = 'pending'
      AND p.amount > 0
    ORDER BY p.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.xendit_payment_session_extension_payments allocation
      WHERE allocation.extension_payment_id = extension_payment.id
        AND allocation.released_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Extension payment % is already claimed', extension_payment.id;
    END IF;

    principal_amount := principal_amount + extension_payment.amount;
    extension_count := extension_count + 1;
  END LOOP;

  IF extension_count = 0 OR principal_amount <= 0 THEN
    RAISE EXCEPTION 'No pending extension payments found';
  END IF;

  surcharge_amount := round(principal_amount * surcharge_percent / 100, 2);
  total_amount := principal_amount + surcharge_amount;

  INSERT INTO public.xendit_payment_sessions (
    id, reference_id, target_type, order_id, store_id, payment_method_id,
    principal_amount_php, surcharge_amount_php, amount_php, created_by
  ) VALUES (
    p_session_id, p_reference_id, 'public_extension', p_order_id,
    order_store_id, p_payment_method_id, principal_amount,
    surcharge_amount, total_amount, NULL
  );

  INSERT INTO public.xendit_payment_session_extension_payments (
    session_id, extension_payment_id, principal_amount_php
  )
  SELECT p_session_id, p.id, p.amount
  FROM public.payments p
  WHERE p.order_id = p_order_id
    AND p.payment_type = 'extension'
    AND p.settlement_status = 'pending'
    AND p.amount > 0;

  RETURN jsonb_build_object(
    'principal_amount_php', principal_amount,
    'surcharge_amount_php', surcharge_amount,
    'amount_php', total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_xendit_session_without_payment(
  p_session_id uuid,
  p_status text,
  p_processing_error text DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  IF p_status NOT IN ('expired', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'Unsupported Xendit terminal status';
  END IF;

  UPDATE public.xendit_payment_sessions
  SET status = p_status,
      processing_error = p_processing_error,
      last_webhook_at = CASE WHEN p_event_key IS NULL THEN last_webhook_at ELSE now() END,
      updated_at = now()
  WHERE id = p_session_id
    AND status <> 'completed';

  GET DIAGNOSTICS closed_count = ROW_COUNT;

  IF closed_count > 0 THEN
    UPDATE public.orders_raw
    SET xendit_payment_session_id = NULL
    WHERE xendit_payment_session_id = p_session_id;

    UPDATE public.xendit_payment_session_extension_payments
    SET released_at = COALESCE(released_at, now())
    WHERE session_id = p_session_id
      AND released_at IS NULL;
  END IF;

  IF p_event_key IS NOT NULL AND p_event_type IS NOT NULL AND p_payload IS NOT NULL THEN
    INSERT INTO public.xendit_webhook_events (
      event_key, event_type, session_id, payload,
      processing_status, processing_error, processed_at
    ) VALUES (
      p_event_key, p_event_type, p_session_id, p_payload,
      'processed', p_processing_error, now()
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_xendit_session_atomic(
  p_session_id uuid,
  p_event_key text,
  p_event_type text,
  p_payload jsonb,
  p_payment_session_id text,
  p_payment_request_id text,
  p_payment_id text,
  p_amount_php numeric,
  p_currency text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row public.xendit_payment_sessions%ROWTYPE;
  allocation public.xendit_payment_session_orders%ROWTYPE;
  raw_order record;
  extension_payment record;
  payment_row_id text;
  order_customer_id text;
  extension_total numeric(12,2) := 0;
  expected_extension_count integer := 0;
  locked_extension_count integer := 0;
  absorbed_extension_count integer := 0;
BEGIN
  SELECT * INTO session_row
  FROM public.xendit_payment_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Xendit session not found';
  END IF;

  INSERT INTO public.xendit_webhook_events (
    event_key, event_type, session_id, payload, processing_status
  ) VALUES (
    p_event_key, p_event_type, p_session_id, p_payload, 'received'
  ) ON CONFLICT (event_key) DO NOTHING;

  IF session_row.status = 'completed' THEN
    UPDATE public.xendit_webhook_events
    SET processing_status = 'processed',
        processing_error = 'Duplicate completion event',
        processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF session_row.status NOT IN ('creating', 'active') THEN
    IF session_row.status IN ('failed', 'expired', 'cancelled') THEN
      UPDATE public.xendit_payment_sessions
      SET status = 'reconciliation_required',
          processing_error = 'Xendit completion arrived after local session closure',
          last_webhook_at = now(),
          updated_at = now()
      WHERE id = p_session_id;
    END IF;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected',
        processing_error = 'Session is already closed or requires reconciliation',
        processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF p_currency <> session_row.currency OR p_amount_php <> session_row.amount_php THEN
    UPDATE public.xendit_payment_sessions
    SET status = 'reconciliation_required', processing_error = 'Provider amount or currency differs from frozen session', updated_at = now()
    WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected', processing_error = 'Provider amount or currency differs from frozen session', processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF session_row.payment_session_id IS NOT NULL
     AND session_row.payment_session_id <> p_payment_session_id THEN
    UPDATE public.xendit_payment_sessions
    SET status = 'reconciliation_required', processing_error = 'Provider session id differs from frozen session', updated_at = now()
    WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected', processing_error = 'Provider session id differs from frozen session', processed_at = now()
    WHERE event_key = p_event_key;
    RETURN false;
  END IF;

  IF session_row.target_type = 'public_booking_group' THEN
    FOR allocation IN
      SELECT * FROM public.xendit_payment_session_orders
      WHERE session_id = p_session_id
      ORDER BY raw_order_id
    LOOP
      SELECT id, status, booking_channel, store_id, xendit_payment_session_id
      INTO raw_order
      FROM public.orders_raw
      WHERE id = allocation.raw_order_id
      FOR UPDATE;
      IF NOT FOUND OR raw_order.status <> 'unprocessed'
         OR raw_order.booking_channel <> 'direct'
         OR raw_order.store_id <> session_row.store_id
         OR raw_order.xendit_payment_session_id IS DISTINCT FROM p_session_id THEN
        UPDATE public.xendit_payment_sessions
        SET status = 'reconciliation_required', processing_error = 'Raw booking changed before Xendit completion', updated_at = now()
        WHERE id = p_session_id;
        UPDATE public.xendit_webhook_events
        SET processing_status = 'rejected', processing_error = 'Raw booking changed before Xendit completion', processed_at = now()
        WHERE event_key = p_event_key;
        RETURN false;
      END IF;
    END LOOP;
    FOR allocation IN
      SELECT * FROM public.xendit_payment_session_orders
      WHERE session_id = p_session_id
      ORDER BY raw_order_id
    LOOP
      payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || allocation.raw_order_id::text);
      INSERT INTO public.payments (
        id, store_id, order_id, raw_order_id, payment_type, amount,
        payment_method_id, transaction_date, settlement_status,
        settlement_ref, created_at
      ) VALUES (
        payment_row_id, session_row.store_id, NULL, allocation.raw_order_id,
        'card_xendit', allocation.amount_php, session_row.payment_method_id,
        (now() AT TIME ZONE 'Asia/Manila')::date, 'pending', p_payment_id, now()
      ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
  ELSIF session_row.target_type = 'staff_order' THEN
    payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || session_row.order_id);
    SELECT customer_id INTO order_customer_id
    FROM public.orders
    WHERE id = session_row.order_id
      AND status = 'active'
      AND store_id = session_row.store_id
      AND balance_due >= session_row.principal_amount_php
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE public.xendit_payment_sessions
      SET status = 'reconciliation_required', processing_error = 'Staff payment target changed before Xendit completion', updated_at = now()
      WHERE id = p_session_id;
      UPDATE public.xendit_webhook_events
      SET processing_status = 'rejected', processing_error = 'Staff payment target changed before Xendit completion', processed_at = now()
      WHERE event_key = p_event_key;
      RETURN false;
    END IF;

    INSERT INTO public.payments (
      id, store_id, order_id, raw_order_id, payment_type, amount,
      payment_method_id, transaction_date, settlement_status,
      settlement_ref, customer_id, created_at
    ) VALUES (
      payment_row_id, session_row.store_id, session_row.order_id, NULL,
      'card_xendit', session_row.amount_php, session_row.payment_method_id,
      (now() AT TIME ZONE 'Asia/Manila')::date, 'pending', p_payment_id,
      order_customer_id, now()
    ) ON CONFLICT (id) DO NOTHING;

    UPDATE public.orders
    SET final_total = COALESCE(final_total, 0) + session_row.surcharge_amount_php,
        card_fee_surcharge = COALESCE(card_fee_surcharge, 0) + session_row.surcharge_amount_php,
        balance_due = GREATEST(0, COALESCE(balance_due, 0) - session_row.principal_amount_php),
        updated_at = now()
    WHERE id = session_row.order_id;
  ELSIF session_row.target_type = 'public_extension' THEN
    SELECT customer_id INTO order_customer_id
    FROM public.orders
    WHERE id = session_row.order_id
      AND status = 'active'
      AND store_id = session_row.store_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE public.xendit_payment_sessions
      SET status = 'reconciliation_required', processing_error = 'Extension target changed before Xendit completion', updated_at = now()
      WHERE id = p_session_id;
      UPDATE public.xendit_webhook_events
      SET processing_status = 'rejected', processing_error = 'Extension target changed before Xendit completion', processed_at = now()
      WHERE event_key = p_event_key;
      RETURN false;
    END IF;

    SELECT count(*)
    INTO expected_extension_count
    FROM public.xendit_payment_session_extension_payments
    WHERE session_id = p_session_id
      AND released_at IS NULL;

    IF expected_extension_count = 0 THEN
      RAISE EXCEPTION 'Xendit extension session has no live payment allocations';
    END IF;

    FOR extension_payment IN
      SELECT p.id, p.order_id, p.payment_type, p.settlement_status,
             p.amount, extension_allocation.principal_amount_php
      FROM public.xendit_payment_session_extension_payments extension_allocation
      JOIN public.payments p ON p.id = extension_allocation.extension_payment_id
      WHERE extension_allocation.session_id = p_session_id
        AND extension_allocation.released_at IS NULL
      ORDER BY p.id
      FOR UPDATE OF p
    LOOP
      IF extension_payment.order_id IS DISTINCT FROM session_row.order_id
         OR extension_payment.payment_type <> 'extension'
         OR extension_payment.settlement_status <> 'pending'
         OR extension_payment.amount <> extension_payment.principal_amount_php THEN
        RAISE EXCEPTION 'Xendit extension payment allocation changed before completion';
      END IF;

      extension_total := extension_total + extension_payment.principal_amount_php;
      locked_extension_count := locked_extension_count + 1;
    END LOOP;

    IF locked_extension_count <> expected_extension_count
       OR extension_total <> session_row.principal_amount_php THEN
      RAISE EXCEPTION 'Xendit extension payment allocation total mismatch';
    END IF;

    payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || session_row.order_id);
    INSERT INTO public.payments (
      id, store_id, order_id, raw_order_id, payment_type, amount,
      payment_method_id, transaction_date, settlement_status,
      settlement_ref, customer_id, created_at
    ) VALUES (
      payment_row_id, session_row.store_id, session_row.order_id, NULL,
      'card_xendit', session_row.amount_php, session_row.payment_method_id,
      (now() AT TIME ZONE 'Asia/Manila')::date, 'pending', p_payment_id,
      order_customer_id, now()
    );

    UPDATE public.payments extension_iou
    SET settlement_status = 'absorbed'
    FROM public.xendit_payment_session_extension_payments extension_allocation
    WHERE extension_allocation.session_id = p_session_id
      AND extension_allocation.released_at IS NULL
      AND extension_iou.id = extension_allocation.extension_payment_id
      AND extension_iou.order_id = session_row.order_id
      AND extension_iou.payment_type = 'extension'
      AND extension_iou.settlement_status = 'pending';

    GET DIAGNOSTICS absorbed_extension_count = ROW_COUNT;
    IF absorbed_extension_count <> expected_extension_count THEN
      RAISE EXCEPTION 'Not all Xendit extension payments were absorbed';
    END IF;

    UPDATE public.orders
    SET final_total = COALESCE(final_total, 0) + session_row.surcharge_amount_php,
        card_fee_surcharge = COALESCE(card_fee_surcharge, 0) + session_row.surcharge_amount_php,
        balance_due = GREATEST(0, COALESCE(balance_due, 0) - session_row.principal_amount_php),
        updated_at = now()
    WHERE id = session_row.order_id;
  ELSE
    RAISE EXCEPTION 'Unsupported Xendit target type %', session_row.target_type;
  END IF;

  UPDATE public.xendit_payment_sessions
  SET payment_session_id = COALESCE(payment_session_id, p_payment_session_id),
      payment_request_id = p_payment_request_id,
      payment_id = p_payment_id,
      status = 'completed',
      completed_at = now(),
      last_webhook_at = now(),
      processing_error = NULL,
      updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.xendit_webhook_events
  SET processing_status = 'processed', processed_at = now()
  WHERE event_key = p_event_key;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_xendit_extension_session_draft(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_extension_session_draft(
  uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_xendit_session_atomic(
  uuid, text, text, jsonb, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_atomic(
  uuid, text, text, jsonb, text, text, text, numeric, text
) TO service_role;

REVOKE ALL ON FUNCTION public.close_xendit_session_without_payment(
  uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_xendit_session_without_payment(
  uuid, text, text, text, text, jsonb
) TO service_role;

-- --------------------------------------------------------------------------
-- Source: 20260911000000_grant_booking_term_override_permission.sql
-- --------------------------------------------------------------------------
-- Data-only permission grant. No table, column, or function changes.
INSERT INTO public.role_permissions (role_id, permission)
SELECT id, 'can_override_booking_terms'
FROM public.roles
WHERE lower(name) = 'admin'
ON CONFLICT DO NOTHING;

-- Xendit closure pass: terminal reconciliation is deliberately separate from
-- ordinary failures. It means Xendit confirmed money movement but the target
-- changed before the webhook could safely apply it.
ALTER TABLE public.xendit_payment_sessions
  DROP CONSTRAINT IF EXISTS xendit_payment_sessions_status_check;
ALTER TABLE public.xendit_payment_sessions
  ADD CONSTRAINT xendit_payment_sessions_status_check
  CHECK (status IN ('creating', 'active', 'completed', 'expired', 'cancelled', 'failed', 'reconciliation_required'));

INSERT INTO public.role_permissions (role_id, permission)
SELECT id, 'can_reconcile_online_payments'
FROM public.roles
WHERE lower(name) = 'admin'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.release_xendit_creating_session(
  p_session_id uuid,
  p_employee_id text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row public.xendit_payment_sessions%ROWTYPE;
BEGIN
  IF length(trim(p_reason)) < 10 OR length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'A 10-500 character reconciliation reason is required';
  END IF;

  SELECT * INTO session_row
  FROM public.xendit_payment_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR session_row.status <> 'creating' OR session_row.payment_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an unresolved creating Xendit session may be released';
  END IF;

  UPDATE public.xendit_payment_sessions
  SET status = 'failed',
      processing_error = 'Manually released after Xendit Dashboard verification: ' || trim(p_reason),
      updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.orders_raw
  SET xendit_payment_session_id = NULL
  WHERE xendit_payment_session_id = p_session_id;

  UPDATE public.xendit_payment_session_extension_payments
  SET released_at = now()
  WHERE session_id = p_session_id AND released_at IS NULL;

  INSERT INTO public.xendit_webhook_events (
    event_key, event_type, session_id, payload, processing_status, processing_error, processed_at
  ) VALUES (
    'manual-release:' || p_session_id::text || ':' || md5(clock_timestamp()::text),
    'manual.creating_release', p_session_id,
    jsonb_build_object('employee_id', p_employee_id, 'reason', trim(p_reason)),
    'processed', 'Verified manual release', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_xendit_creating_session(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_xendit_creating_session(uuid, text, text) TO service_role;

-- --------------------------------------------------------------------------
-- Final installation assertions
-- --------------------------------------------------------------------------

DO $verify$
DECLARE
  missing_relations text;
  missing_indexes text;
  missing_constraints text;
  function_oid oid;
  relation_name text;
BEGIN
  SELECT string_agg(required.relation_name, ', ' ORDER BY required.relation_name)
  INTO missing_relations
  FROM (
    VALUES
      ('public.xendit_payment_sessions'),
      ('public.xendit_payment_session_orders'),
      ('public.xendit_payment_session_extension_payments'),
      ('public.xendit_webhook_events')
  ) AS required(relation_name)
  WHERE to_regclass(required.relation_name) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'Xendit verification failed. Missing relations: %',
      missing_relations;
  END IF;

  SELECT string_agg(required.index_name, ', ' ORDER BY required.index_name)
  INTO missing_indexes
  FROM (
    VALUES
      ('public.idx_xendit_sessions_status'),
      ('public.idx_xendit_active_staff_order'),
      ('public.idx_xendit_session_orders_raw'),
      ('public.idx_xendit_card_settlements_payment'),
      ('public.idx_xendit_live_extension_payment_claim'),
      ('public.idx_xendit_extension_payments_session')
  ) AS required(index_name)
  WHERE to_regclass(required.index_name) IS NULL;

  IF missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION
      'Xendit verification failed. Missing indexes: %',
      missing_indexes;
  END IF;

  SELECT string_agg(required.constraint_name, ', ' ORDER BY required.constraint_name)
  INTO missing_constraints
  FROM (
    VALUES
      ('payment_methods_gateway_provider_check'),
      ('xendit_session_amounts_match'),
      ('xendit_session_target_matches'),
      ('xendit_payment_sessions_target_type_check'),
      ('xendit_payment_sessions_status_check'),
      ('xendit_session_order_amounts_match')
  ) AS required(constraint_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = required.constraint_name
      AND connamespace = 'public'::regnamespace
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION
      'Xendit verification failed. Missing constraints: %',
      missing_constraints;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders_raw'
      AND column_name = 'web_card_fee_surcharge'
      AND data_type = 'numeric'
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. orders_raw.web_card_fee_surcharge is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders_raw'
      AND column_name = 'xendit_payment_session_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. orders_raw.xendit_payment_session_id is missing or incompatible';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'xendit_payment_sessions',
    'xendit_payment_session_orders',
    'xendit_payment_session_extension_payments',
    'xendit_webhook_events'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = ('public.' || relation_name)::regclass
        AND relrowsecurity
    ) THEN
      RAISE EXCEPTION
        'Xendit verification failed. RLS is not enabled on public.%',
        relation_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE polrelid = ('public.' || relation_name)::regclass
        AND polname = 'Service role full access'
    ) THEN
      RAISE EXCEPTION
        'Xendit verification failed. Service-role policy is missing on public.%',
        relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.payments'::regclass
      AND tgname = 'payments_create_xendit_card_settlement'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. Payment settlement trigger is missing';
  END IF;

  FOREACH function_oid IN ARRAY ARRAY[
    to_regprocedure(
      'public.create_xendit_session_draft(uuid,text,text,text,text,text,numeric,numeric,numeric,text,jsonb)'
    ),
    to_regprocedure(
      'public.create_xendit_extension_session_draft(uuid,text,text,text)'
    ),
    to_regprocedure(
      'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)'
    ),
    to_regprocedure(
      'public.close_xendit_session_without_payment(uuid,text,text,text,text,jsonb)'
    ),
    to_regprocedure(
      'public.release_xendit_creating_session(uuid,text,text)'
    )
  ]
  LOOP
    IF function_oid IS NULL THEN
      RAISE EXCEPTION
        'Xendit verification failed. A required RPC signature is missing';
    END IF;

    IF NOT has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION
        'Xendit verification failed. service_role cannot execute function %',
        function_oid::regprocedure;
    END IF;

    IF has_function_privilege('anon', function_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION
        'Xendit verification failed. Client roles can execute protected function %',
        function_oid::regprocedure;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc
      CROSS JOIN LATERAL aclexplode(
        COALESCE(pg_proc.proacl, acldefault('f', pg_proc.proowner))
      ) AS function_acl
      WHERE pg_proc.oid = function_oid
        AND function_acl.grantee = 0
        AND function_acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'Xendit verification failed. PUBLIC can execute protected function %',
        function_oid::regprocedure;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_methods
    WHERE id = 'xendit'
      AND gateway_provider = 'xendit'
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. Xendit payment method is missing or misconfigured';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.role_permissions AS role_permissions
    JOIN public.roles AS roles ON roles.id = role_permissions.role_id
    WHERE lower(roles.name) = 'admin'
      AND role_permissions.permission = 'can_override_booking_terms'
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. Admin booking-term override permission is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.role_permissions AS role_permissions
    JOIN public.roles AS roles ON roles.id = role_permissions.role_id
    WHERE lower(roles.name) = 'admin'
      AND role_permissions.permission = 'can_reconcile_online_payments'
  ) THEN
    RAISE EXCEPTION
      'Xendit verification failed. Admin online-payment reconciliation permission is missing';
  END IF;
END;
$verify$;

COMMIT;

SELECT
  'Xendit manual schema installation completed' AS result,
  current_database() AS database_name,
  now() AS completed_at,
  (
    SELECT count(*)
    FROM public.xendit_payment_sessions
  ) AS existing_session_count,
  (
    SELECT count(*)
    FROM public.xendit_webhook_events
  ) AS existing_webhook_event_count;
