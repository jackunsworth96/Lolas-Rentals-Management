-- Run manually on backed-up staging after the Phase 2 and deposit-guard scripts.
-- This file is intentionally outside supabase/migrations and is never run locally.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('lolas-xendit-phase3'));

DO $preflight$
DECLARE v_check record; v_actual text;
BEGIN
  IF to_regprocedure('public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('public.complete_xendit_session_phase1_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('public.create_xendit_full_rental_session_draft(uuid,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.create_xendit_walkin_staff_session_draft(uuid,text,uuid,text,text,text,numeric)') IS NULL
     OR to_regclass('public.payment_routing_rules') IS NULL
     OR to_regclass('public.chart_of_accounts') IS NULL
     OR to_regprocedure('public.confirm_extend_order_atomic(text,text,timestamp with time zone,integer,jsonb,numeric,text,text,numeric,text,date,text,text,text,text,boolean,text,text,text,date,text,text)') IS NULL
     OR to_regprocedure('public.cancel_activated_order_atomic(text,timestamp with time zone,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Phase 3 requires the reviewed Phase 2, deposit guard, routing, and cancellation contracts';
  END IF;
  FOR v_check IN SELECT * FROM (VALUES
    ('orders','id','text'),('orders','security_deposit','numeric(12,2)'),
    ('orders','balance_due','numeric(12,2)'),('orders','return_charges_note','text'),
    ('orders_raw','id','uuid'),('orders_raw','payload','jsonb'),
    ('orders_raw','dropoff_location_id','integer'),
    ('orders_raw','dropoff_location_address','text'),
    ('payments','id','text'),('payments','raw_order_id','uuid'),
    ('payments','settlement_ref','text'),('journal_entries','id','text'),
    ('journal_entries','reference_id','text'),('chart_of_accounts','id','text'),
    ('xendit_payment_sessions','id','uuid'),('xendit_payment_sessions','payment_id','text')
  ) AS required(table_name,column_name,data_type) LOOP
    SELECT format_type(a.atttypid,a.atttypmod) INTO v_actual
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.' || v_check.table_name)
      AND a.attname = v_check.column_name AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_check.data_type THEN
      RAISE EXCEPTION 'Phase 3 requires %.% of type %, found %',
        v_check.table_name,v_check.column_name,v_check.data_type,COALESCE(v_actual,'missing');
    END IF;
  END LOOP;
  IF to_regclass('public.xendit_payment_session_deposits') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.xendit_payment_session_deposits')
        AND contype = 'p' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = to_regclass('public.xendit_payment_session_deposits')
            AND attname = 'session_id')]::smallint[]) THEN
      RAISE EXCEPTION 'Existing Phase 3 deposit allocation table has an incompatible primary key';
    END IF;
  END IF;
END;
$preflight$;

ALTER TABLE public.xendit_payment_sessions DROP CONSTRAINT IF EXISTS xendit_payment_sessions_target_type_check;
ALTER TABLE public.xendit_payment_sessions ADD CONSTRAINT xendit_payment_sessions_target_type_check
  CHECK (target_type IN ('public_booking_group','staff_order','public_extension','staff_addon',
    'staff_rental_deposit','staff_raw_rental_deposit','staff_deposit'));
ALTER TABLE public.xendit_payment_sessions DROP CONSTRAINT IF EXISTS xendit_session_target_matches;
ALTER TABLE public.xendit_payment_sessions ADD CONSTRAINT xendit_session_target_matches CHECK (
  (target_type IN ('staff_order','public_extension','staff_addon','staff_rental_deposit','staff_deposit') AND order_id IS NOT NULL)
  OR (target_type IN ('public_booking_group','staff_raw_rental_deposit') AND order_id IS NULL)
);

CREATE TABLE IF NOT EXISTS public.xendit_payment_session_deposits (
  session_id uuid PRIMARY KEY REFERENCES public.xendit_payment_sessions(id) ON DELETE CASCADE,
  order_id text REFERENCES public.orders(id),
  raw_order_id uuid REFERENCES public.orders_raw(id),
  rental_principal_php numeric(12,2) NOT NULL DEFAULT 0 CHECK (rental_principal_php >= 0),
  rental_surcharge_php numeric(12,2) NOT NULL DEFAULT 0 CHECK (rental_surcharge_php >= 0),
  deposit_php numeric(12,2) NOT NULL CHECK (deposit_php > 0),
  receiving_account_id text NOT NULL REFERENCES public.chart_of_accounts(id),
  liability_account_id text NOT NULL REFERENCES public.chart_of_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xendit_deposit_target_check CHECK ((order_id IS NULL) <> (raw_order_id IS NULL))
);
ALTER TABLE public.xendit_payment_session_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.xendit_payment_session_deposits;
CREATE POLICY "Service role full access" ON public.xendit_payment_session_deposits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.xendit_refund_requests (
  id uuid PRIMARY KEY,
  reference_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES public.orders(id),
  source_payment_id text NOT NULL REFERENCES public.payments(id),
  session_id uuid NOT NULL REFERENCES public.xendit_payment_sessions(id),
  payment_request_id text NOT NULL,
  provider_refund_id text UNIQUE,
  amount_php numeric(12,2) NOT NULL CHECK (amount_php > 0),
  kind text NOT NULL CHECK (kind IN ('rental','deposit')),
  reason text NOT NULL,
  created_by text NOT NULL REFERENCES public.employees(id),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN
    ('reserved','pending','succeeded','failed','reconciliation_required')),
  provider_payload jsonb,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xendit_refunds_order ON public.xendit_refund_requests(order_id,created_at DESC);
ALTER TABLE public.xendit_refund_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.xendit_refund_requests;
CREATE POLICY "Service role full access" ON public.xendit_refund_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.xendit_cancellation_decisions (
  order_id text PRIMARY KEY REFERENCES public.orders(id),
  cancelled_by text NOT NULL REFERENCES public.employees(id),
  reason text NOT NULL,
  deposit_charge_php numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_charge_php >= 0),
  deposit_charge_reason text,
  deposit_charge_status text NOT NULL DEFAULT 'pending_finance_review'
    CHECK (deposit_charge_status IN ('pending_finance_review','not_applicable','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.xendit_cancellation_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.xendit_cancellation_decisions;
CREATE POLICY "Service role full access" ON public.xendit_cancellation_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.xendit_payment_session_deposits,
  public.xendit_refund_requests, public.xendit_cancellation_decisions
  FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.xendit_payment_session_deposits,
  public.xendit_refund_requests, public.xendit_cancellation_decisions TO service_role;

DO $table_contracts$
DECLARE v_check record; v_actual text;
BEGIN
  FOR v_check IN SELECT * FROM (VALUES
    ('xendit_payment_session_deposits','session_id','uuid'),
    ('xendit_payment_session_deposits','order_id','text'),
    ('xendit_payment_session_deposits','raw_order_id','uuid'),
    ('xendit_payment_session_deposits','deposit_php','numeric(12,2)'),
    ('xendit_refund_requests','id','uuid'),
    ('xendit_refund_requests','source_payment_id','text'),
    ('xendit_refund_requests','amount_php','numeric(12,2)'),
    ('xendit_refund_requests','status','text'),
    ('xendit_cancellation_decisions','order_id','text'),
    ('xendit_cancellation_decisions','deposit_charge_php','numeric(12,2)'),
    ('xendit_cancellation_decisions','deposit_charge_status','text')
  ) AS required(table_name,column_name,data_type) LOOP
    SELECT format_type(a.atttypid,a.atttypmod) INTO v_actual
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.' || v_check.table_name)
      AND a.attname = v_check.column_name AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_actual IS DISTINCT FROM v_check.data_type THEN
      RAISE EXCEPTION 'Phase 3 table %.% must be %, found %',
        v_check.table_name,v_check.column_name,v_check.data_type,COALESCE(v_actual,'missing');
    END IF;
  END LOOP;
  FOR v_check IN SELECT * FROM (VALUES
    ('xendit_payment_session_deposits','session_id','p'),
    ('xendit_refund_requests','id','p'),
    ('xendit_refund_requests','reference_id','u'),
    ('xendit_refund_requests','provider_refund_id','u'),
    ('xendit_cancellation_decisions','order_id','p')
  ) AS required(table_name,column_name,constraint_type) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = v_check.column_name
      WHERE c.conrelid = to_regclass('public.' || v_check.table_name)
        AND c.contype::text = v_check.constraint_type
        AND c.conkey = ARRAY[a.attnum]::smallint[]) THEN
      RAISE EXCEPTION 'Phase 3 table %.% requires a single-column % constraint',
        v_check.table_name,v_check.column_name,v_check.constraint_type;
    END IF;
  END LOOP;
END;
$table_contracts$;

-- The legacy extension RPC changes the return date without checking its old
-- value. The checked entry point serializes confirmation and keeps the
-- ancillary add-on/location writes in the same transaction as the extension.
CREATE OR REPLACE FUNCTION public.confirm_extend_order_guarded_atomic(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_result jsonb;
  v_addon jsonb;
  v_expected_dropoff timestamptz := (p_payload->>'expectedDropoff')::timestamptz;
  v_new_dropoff timestamptz := (p_payload->>'newDropoff')::timestamptz;
  v_store_id text := p_payload->>'storeId';
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_payload->>'orderId' FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'active' OR v_order.store_id <> v_store_id THEN
    RAISE EXCEPTION 'Active extension order changed';
  END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id = p_payload->>'orderItemId' FOR UPDATE;
  IF NOT FOUND OR v_item.order_id <> v_order.id OR v_item.dropoff_datetime IS DISTINCT FROM v_expected_dropoff
     OR v_new_dropoff <= v_expected_dropoff OR (p_payload->>'newDays')::integer <= 0 THEN
    RAISE EXCEPTION 'Return date changed; refresh the extension quote';
  END IF;
  IF (p_payload->>'totalDelta')::numeric < 0
     OR (p_payload->>'totalDelta')::numeric IS DISTINCT FROM (p_payload->>'amount')::numeric
     OR EXISTS (SELECT 1 FROM public.xendit_payment_sessions
       WHERE order_id = v_order.id AND status IN ('creating','active','reconciliation_required')) THEN
    RAISE EXCEPTION 'Extension quote or payment state changed';
  END IF;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'addonUpdates','[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.order_addons
      WHERE id = v_addon->>'id' AND order_id = v_order.id
        AND total_amount = (v_addon->>'expected_total')::numeric) THEN
      RAISE EXCEPTION 'Existing add-on price changed; refresh the extension quote';
    END IF;
  END LOOP;
  v_result := public.confirm_extend_order_atomic(
    v_order.id,v_item.id,v_new_dropoff,(p_payload->>'newDays')::integer,
    COALESCE(p_payload->'addonUpdates','[]'::jsonb),(p_payload->>'totalDelta')::numeric,
    p_payload->>'paymentId',v_store_id,(p_payload->>'amount')::numeric,
    p_payload->>'paymentMethodId',(p_payload->>'transactionDate')::date,
    p_payload->>'settlementStatus',p_payload->>'settlementRef',v_order.customer_id,
    v_item.id,(p_payload->>'isPaid')::boolean,p_payload->>'receivableAcct',
    p_payload->>'incomeAcct',p_payload->>'journalTxId',(p_payload->>'journalDate')::date,
    p_payload->>'journalPeriod',p_payload->>'extDescription'
  );
  IF COALESCE((v_result->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Extension posting failed: %',COALESCE(v_result->>'error','unknown database error');
  END IF;
  IF p_payload->>'newDropoffLocationId' IS NOT NULL THEN
    UPDATE public.order_items SET
      dropoff_location_id = p_payload->>'newDropoffLocationId',
      dropoff_fee = (p_payload->>'newDropoffLocationFee')::numeric
    WHERE id = v_item.id;
    IF v_order.booking_token IS NOT NULL THEN
      UPDATE public.orders_raw SET
        dropoff_location_id = (p_payload->>'newDropoffLocationId')::integer,
        dropoff_location_address = COALESCE(p_payload->>'newDropoffLocationAddress',dropoff_location_address)
      WHERE order_reference = v_order.booking_token AND status = 'processed';
    END IF;
  END IF;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'newAddons','[]'::jsonb)) LOOP
    INSERT INTO public.order_addons(id,order_id,addon_name,addon_price,addon_type,
      quantity,total_amount,store_id)
    VALUES(v_addon->>'id',v_order.id,v_addon->>'name',(v_addon->>'price')::numeric,
      v_addon->>'type',(v_addon->>'quantity')::integer,(v_addon->>'total')::numeric,
      v_store_id);
  END LOOP;
  RETURN jsonb_build_object('success',true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_extend_order_guarded_atomic(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_extend_order_guarded_atomic(jsonb) TO service_role;

-- Fail closed unless the store has one routed Xendit clearing asset and one
-- designated security-deposit liability. The API never supplies accounting IDs.
CREATE OR REPLACE FUNCTION public.resolve_xendit_deposit_accounts(p_store_id text)
RETURNS TABLE(receiving_id text, liability_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_liability_count bigint;
BEGIN
  SELECT r.received_into_account_id INTO receiving_id
  FROM public.payment_routing_rules r
  JOIN public.chart_of_accounts a ON a.id = r.received_into_account_id
  WHERE r.store_id = p_store_id AND r.payment_method_id = 'xendit'
    AND a.is_active AND lower(a.account_type) = 'asset'
    AND a.store_id IN (p_store_id,'company');
  IF receiving_id IS NULL THEN RAISE EXCEPTION 'Xendit receiving account routing is not configured'; END IF;
  SELECT count(*), min(a.id) INTO v_liability_count, liability_id
  FROM public.chart_of_accounts a
  WHERE a.store_id = p_store_id AND a.is_active
    AND lower(a.account_type) = 'liability'
    AND (a.id LIKE 'DEPOSITS-HELD-%' OR a.id = 'DEPOSIT-LIAB-' || p_store_id);
  IF v_liability_count <> 1 THEN
    RAISE EXCEPTION 'Configure exactly one active store-owned security deposit liability account';
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_xendit_order_deposit_draft(
  p_session_id uuid,p_reference_id text,p_order_id text,p_store_id text,
  p_payment_method_id text,p_created_by text,p_include_rental boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_deposit numeric(12,2);
  v_rental jsonb;
  v_rental_principal numeric(12,2) := 0;
  v_surcharge numeric(12,2) := 0;
  v_receiving text;
  v_liability text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'active' OR v_order.store_id <> p_store_id THEN
    RAISE EXCEPTION 'Active order is required for deposit checkout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = p_payment_method_id
    AND is_active AND gateway_provider = 'xendit') THEN
    RAISE EXCEPTION 'Xendit payment method is unavailable';
  END IF;
  SELECT v_order.security_deposit - COALESCE(sum(amount),0) INTO v_deposit
  FROM public.payments WHERE order_id = p_order_id AND payment_type IN ('deposit','security_deposit');
  IF v_deposit <= 0 OR v_deposit <> round(v_deposit,2) THEN
    RAISE EXCEPTION 'Order has no collectible security deposit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND payment_type = 'deposit_refund') THEN
    RAISE EXCEPTION 'Deposit already has a refund history; finance review required';
  END IF;
  SELECT receiving_id,liability_id INTO v_receiving,v_liability
    FROM public.resolve_xendit_deposit_accounts(p_store_id);
  IF p_include_rental THEN
    v_rental := public.create_xendit_full_rental_session_draft(
      p_session_id,p_reference_id,p_order_id,p_store_id,p_payment_method_id,p_created_by);
    v_rental_principal := (v_rental->>'principalPHP')::numeric;
    v_surcharge := (v_rental->>'surchargePHP')::numeric;
    UPDATE public.xendit_payment_sessions SET
      target_type = 'staff_rental_deposit',
      principal_amount_php = principal_amount_php + v_deposit,
      amount_php = amount_php + v_deposit
    WHERE id = p_session_id;
  ELSE
    IF v_order.balance_due > 0 OR EXISTS (SELECT 1 FROM public.xendit_payment_sessions
      WHERE order_id = p_order_id AND status IN ('creating','active','reconciliation_required')) THEN
      RAISE EXCEPTION 'Rental must be paid and no checkout may be live';
    END IF;
    INSERT INTO public.xendit_payment_sessions (
      id,reference_id,target_type,order_id,store_id,payment_method_id,
      principal_amount_php,surcharge_amount_php,amount_php,created_by
    ) VALUES (p_session_id,p_reference_id,'staff_deposit',p_order_id,p_store_id,
      p_payment_method_id,v_deposit,0,v_deposit,p_created_by);
  END IF;
  INSERT INTO public.xendit_payment_session_deposits (
    session_id,order_id,rental_principal_php,rental_surcharge_php,deposit_php,
    receiving_account_id,liability_account_id
  ) VALUES (p_session_id,p_order_id,v_rental_principal,v_surcharge,v_deposit,
    v_receiving,v_liability);
  RETURN jsonb_build_object('principalPHP',v_rental_principal,
    'surchargePHP',v_surcharge,'depositPHP',v_deposit,
    'amountPHP',v_rental_principal + v_surcharge + v_deposit);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_xendit_raw_deposit_draft(
  p_session_id uuid,p_reference_id text,p_raw_order_id uuid,p_store_id text,
  p_payment_method_id text,p_created_by text,p_expected_amount_php numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw public.orders_raw%ROWTYPE;
  v_deposit numeric(12,2);
  v_rental jsonb;
  v_receiving text;
  v_liability text;
BEGIN
  SELECT * INTO v_raw FROM public.orders_raw WHERE id = p_raw_order_id FOR UPDATE;
  IF NOT FOUND OR v_raw.status <> 'unprocessed' OR v_raw.booking_channel <> 'walk_in'
     OR v_raw.store_id <> p_store_id THEN
    RAISE EXCEPTION 'Staff reservation is no longer payable';
  END IF;
  v_deposit := round(COALESCE((v_raw.payload->>'deposit_amount')::numeric,0),2);
  IF v_deposit <= 0 OR p_expected_amount_php <= v_deposit OR EXISTS (
    SELECT 1 FROM public.payments WHERE raw_order_id = p_raw_order_id
      AND payment_type IN ('deposit','security_deposit')) THEN
    RAISE EXCEPTION 'Reservation deposit is unavailable or already collected';
  END IF;
  SELECT receiving_id,liability_id INTO v_receiving,v_liability
    FROM public.resolve_xendit_deposit_accounts(p_store_id);
  v_rental := public.create_xendit_walkin_staff_session_draft(
    p_session_id,p_reference_id,p_raw_order_id,p_store_id,p_payment_method_id,
    p_created_by,p_expected_amount_php - v_deposit);
  UPDATE public.xendit_payment_sessions SET
    target_type = 'staff_raw_rental_deposit',
    principal_amount_php = principal_amount_php + v_deposit,
    amount_php = amount_php + v_deposit
  WHERE id = p_session_id;
  INSERT INTO public.xendit_payment_session_deposits (
    session_id,raw_order_id,rental_principal_php,rental_surcharge_php,deposit_php,
    receiving_account_id,liability_account_id
  ) VALUES (p_session_id,p_raw_order_id,(v_rental->>'principalPHP')::numeric,
    (v_rental->>'surchargePHP')::numeric,v_deposit,v_receiving,v_liability);
  RETURN jsonb_build_object('principalPHP',(v_rental->>'principalPHP')::numeric,
    'surchargePHP',(v_rental->>'surchargePHP')::numeric,
    'depositPHP',v_deposit,'amountPHP',p_expected_amount_php);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_xendit_deposit_accounts(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_xendit_order_deposit_draft(uuid,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_xendit_raw_deposit_draft(uuid,text,uuid,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_xendit_deposit_accounts(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_xendit_order_deposit_draft(uuid,text,text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_xendit_raw_deposit_draft(uuid,text,uuid,text,text,text,numeric) TO service_role;

DO $rename_completion$
DECLARE v_definition text;
BEGIN
  IF to_regprocedure('public.complete_xendit_session_phase2_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL THEN
    SELECT pg_get_functiondef(to_regprocedure(
      'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)')) INTO v_definition;
    IF position('xendit_payment_session_addon_payments' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected Xendit completion body; inspect before Phase 3 installation';
    END IF;
    ALTER FUNCTION public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)
      RENAME TO complete_xendit_session_phase2_atomic;
  END IF;
END;
$rename_completion$;
REVOKE ALL ON FUNCTION public.complete_xendit_session_phase2_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_phase2_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_xendit_session_atomic(
  p_session_id uuid,p_event_key text,p_event_type text,p_payload jsonb,
  p_payment_session_id text,p_payment_request_id text,p_payment_id text,
  p_amount_php numeric,p_currency text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session public.xendit_payment_sessions%ROWTYPE;
  v_allocation public.xendit_payment_session_deposits%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_raw public.orders_raw%ROWTYPE;
  v_rejection text;
  v_rental_amount numeric(12,2);
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_deposit_payment_id text;
  v_rental_payment_id text;
BEGIN
  SELECT * INTO v_session FROM public.xendit_payment_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Xendit session not found'; END IF;
  IF v_session.target_type NOT IN ('staff_rental_deposit','staff_raw_rental_deposit','staff_deposit') THEN
    RETURN public.complete_xendit_session_phase2_atomic(p_session_id,p_event_key,p_event_type,
      p_payload,p_payment_session_id,p_payment_request_id,p_payment_id,p_amount_php,p_currency);
  END IF;

  INSERT INTO public.xendit_webhook_events(event_key,event_type,session_id,payload,processing_status)
  VALUES(p_event_key,p_event_type,p_session_id,p_payload,'received')
  ON CONFLICT(event_key) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.xendit_webhook_events
      WHERE event_key = p_event_key AND session_id = p_session_id
        AND event_type = p_event_type AND payload = p_payload) THEN
    RAISE EXCEPTION 'Webhook event key belongs to a different Xendit session';
  END IF;
  IF v_session.status = 'completed' THEN
    UPDATE public.xendit_webhook_events SET processing_status = 'processed',
      processing_error = 'Duplicate completion event',processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;
  IF v_session.status = 'reconciliation_required' THEN
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = 'Session already requires finance reconciliation',processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;
  IF v_session.status NOT IN ('creating','active') THEN
    v_rejection := 'Provider completion arrived after local checkout closure';
  ELSIF p_payment_session_id IS NULL OR btrim(p_payment_session_id) = ''
     OR (v_session.payment_session_id IS NOT NULL
         AND v_session.payment_session_id <> p_payment_session_id) THEN
    v_rejection := 'Provider session id differs from checkout';
  ELSIF p_payment_id IS NULL OR btrim(p_payment_id) = ''
     OR p_payment_request_id IS NULL OR btrim(p_payment_request_id) = '' THEN
    v_rejection := 'Provider completion lacks refund-capable payment identifiers';
  ELSIF p_amount_php IS DISTINCT FROM v_session.amount_php OR p_currency IS DISTINCT FROM 'PHP' THEN
    v_rejection := 'Provider amount or currency differs from frozen checkout';
  END IF;

  SELECT * INTO v_allocation FROM public.xendit_payment_session_deposits
    WHERE session_id = p_session_id FOR UPDATE;
  IF v_rejection IS NULL AND (NOT FOUND
    OR v_session.principal_amount_php <> v_allocation.rental_principal_php + v_allocation.deposit_php
    OR v_session.surcharge_amount_php <> v_allocation.rental_surcharge_php
    OR v_session.amount_php <> v_allocation.rental_principal_php
      + v_allocation.rental_surcharge_php + v_allocation.deposit_php
    OR (v_session.target_type = 'staff_raw_rental_deposit'
      AND (v_allocation.raw_order_id IS NULL OR v_allocation.order_id IS NOT NULL))
    OR (v_session.target_type IN ('staff_rental_deposit','staff_deposit')
      AND (v_allocation.order_id IS DISTINCT FROM v_session.order_id
        OR v_allocation.raw_order_id IS NOT NULL))) THEN
    v_rejection := 'Frozen rental and deposit allocations differ from checkout';
  END IF;
  v_rental_amount := COALESCE(v_allocation.rental_principal_php,0)
    + COALESCE(v_allocation.rental_surcharge_php,0);

  IF v_rejection IS NULL AND v_session.target_type = 'staff_raw_rental_deposit' THEN
    SELECT * INTO v_raw FROM public.orders_raw WHERE id = v_allocation.raw_order_id FOR UPDATE;
    IF NOT FOUND OR v_raw.status <> 'unprocessed' OR v_raw.booking_channel <> 'walk_in'
       OR v_raw.store_id <> v_session.store_id
       OR v_raw.xendit_payment_session_id IS DISTINCT FROM p_session_id
       OR v_raw.web_quote_raw IS DISTINCT FROM v_rental_amount
       OR round(COALESCE((v_raw.payload->>'deposit_amount')::numeric,0),2)
         IS DISTINCT FROM v_allocation.deposit_php
       OR (SELECT count(*) FROM public.xendit_payment_session_orders
           WHERE session_id = p_session_id AND raw_order_id = v_allocation.raw_order_id) <> 1
       OR EXISTS (SELECT 1 FROM public.payments WHERE raw_order_id = v_raw.id
           AND payment_type IN ('card_xendit','deposit','security_deposit')) THEN
      v_rejection := 'Staff reservation changed before provider completion';
    END IF;
  ELSIF v_rejection IS NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_allocation.order_id FOR UPDATE;
    IF NOT FOUND OR v_order.status <> 'active' OR v_order.store_id <> v_session.store_id
       OR v_order.balance_due IS DISTINCT FROM v_allocation.rental_principal_php
       OR v_order.security_deposit < v_allocation.deposit_php
         + COALESCE((SELECT sum(amount) FROM public.payments
             WHERE order_id = v_order.id AND payment_type IN ('deposit','security_deposit')),0)
       OR (v_session.target_type = 'staff_deposit' AND
          (v_order.balance_due > 0 OR v_allocation.rental_principal_php <> 0))
       OR (v_session.target_type = 'staff_rental_deposit' AND
          (v_order.payment_method_id <> v_session.payment_method_id
           OR v_allocation.rental_principal_php <= 0)) THEN
      v_rejection := 'Active order changed before provider completion';
    END IF;
  END IF;

  IF v_rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions SET status = 'reconciliation_required',
      processing_error = v_rejection,last_webhook_at = now(),updated_at = now()
    WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_rejection,processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;

  BEGIN
    v_deposit_payment_id := 'PAY-XENDIT-DEPOSIT-' || md5(p_payment_id || p_session_id::text);
    IF v_rental_amount > 0 THEN
      v_rental_payment_id := 'PAY-XENDIT-' || md5(p_payment_id || p_session_id::text);
      INSERT INTO public.payments(id,store_id,order_id,raw_order_id,payment_type,amount,
        payment_method_id,transaction_date,settlement_status,settlement_ref,customer_id)
      VALUES(v_rental_payment_id,v_session.store_id,v_allocation.order_id,v_allocation.raw_order_id,
        'card_xendit',v_rental_amount,v_session.payment_method_id,v_date,'pending',p_payment_id,
        CASE WHEN v_allocation.order_id IS NULL THEN NULL ELSE v_order.customer_id END);
    END IF;
    INSERT INTO public.payments(id,store_id,order_id,raw_order_id,payment_type,amount,
      payment_method_id,transaction_date,settlement_status,settlement_ref,customer_id,account_id)
    VALUES(v_deposit_payment_id,v_session.store_id,v_allocation.order_id,v_allocation.raw_order_id,
      'deposit',v_allocation.deposit_php,v_session.payment_method_id,v_date,'pending',p_payment_id,
      CASE WHEN v_allocation.order_id IS NULL THEN NULL ELSE v_order.customer_id END,
      v_allocation.receiving_account_id);
    INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,
      debit,credit,description,reference_type,reference_id,created_by)
    VALUES
      (gen_random_uuid()::text,p_session_id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_session.store_id,v_allocation.receiving_account_id,v_allocation.deposit_php,0,
        'Xendit security deposit received','payment',v_deposit_payment_id,NULL),
      (gen_random_uuid()::text,p_session_id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_session.store_id,v_allocation.liability_account_id,0,v_allocation.deposit_php,
        'Xendit refundable deposit held','payment',v_deposit_payment_id,NULL);
    IF v_allocation.order_id IS NOT NULL THEN
      UPDATE public.orders SET
        balance_due = balance_due - v_allocation.rental_principal_php,
        final_total = COALESCE(final_total,0) + v_allocation.rental_surcharge_php,
        card_fee_surcharge = COALESCE(card_fee_surcharge,0) + v_allocation.rental_surcharge_php,
        deposit_status = CASE WHEN v_allocation.deposit_php
          + COALESCE((SELECT sum(amount) FROM public.payments
              WHERE order_id = v_order.id AND payment_type IN ('deposit','security_deposit')
                AND id <> v_deposit_payment_id),0) = security_deposit THEN 'paid' ELSE deposit_status END,
        deposit_method_id = v_session.payment_method_id,updated_at = now()
      WHERE id = v_allocation.order_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_rejection := left('Phase 3 financial completion failed: ' || SQLERRM,1000);
  END;
  IF v_rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions SET status = 'reconciliation_required',
      processing_error = v_rejection,last_webhook_at = now(),updated_at = now()
    WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_rejection,processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;

  UPDATE public.xendit_payment_sessions SET
    payment_session_id = COALESCE(payment_session_id,p_payment_session_id),
    payment_request_id = p_payment_request_id,payment_id = p_payment_id,
    status = 'completed',completed_at = now(),last_webhook_at = now(),
    processing_error = NULL,updated_at = now()
  WHERE id = p_session_id;
  UPDATE public.xendit_webhook_events SET processing_status = 'processed',processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_xendit_session_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_xendit_refund_atomic(
  p_refund_id uuid,p_reference_id text,p_order_id text,p_source_payment_id text,
  p_amount_php numeric,p_reason text,p_employee_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_session public.xendit_payment_sessions%ROWTYPE;
  v_allocation public.xendit_payment_session_deposits%ROWTYPE;
  v_decision public.xendit_cancellation_decisions%ROWTYPE;
  v_prior numeric(12,2);
  v_manual_refunded numeric(12,2);
  v_applied numeric(12,2);
  v_session_refunded numeric(12,2);
  v_deposit_held numeric(12,2);
  v_deposit_unresolved numeric(12,2);
  v_pending_charge numeric(12,2) := 0;
  v_receiving text;
  v_income text;
  v_kind text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('active','cancelled','completed') THEN
    RAISE EXCEPTION 'Order is not eligible for a Xendit refund';
  END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_payment_sessions
      WHERE order_id = p_order_id AND status IN ('creating','active','reconciliation_required')) THEN
    RAISE EXCEPTION 'Resolve the live or disputed checkout before requesting a refund';
  END IF;
  IF p_amount_php <= 0 OR p_amount_php <> round(p_amount_php,2)
     OR length(btrim(p_reason)) < 10 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Refund amount or reason is invalid';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_source_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.order_id <> p_order_id OR v_payment.payment_method_id <> 'xendit'
     OR v_payment.payment_type NOT IN ('card_xendit','deposit') THEN
    RAISE EXCEPTION 'Refund source is not an online payment for this order';
  END IF;
  v_kind := CASE WHEN v_payment.payment_type = 'deposit' THEN 'deposit' ELSE 'rental' END;
  IF v_kind = 'rental' AND (
    COALESCE(v_order.charity_donation,0) > 0
    OR EXISTS (SELECT 1 FROM public.journal_entries j
      WHERE j.reference_type = 'order' AND j.reference_id = p_order_id
        AND j.description ILIKE '%transfer fee income%')
  ) THEN
    RAISE EXCEPTION 'Mixed rental, charity, or transfer refund needs finance allocation review';
  END IF;
  SELECT * INTO v_session FROM public.xendit_payment_sessions
    WHERE payment_id = v_payment.settlement_ref AND status = 'completed';
  IF NOT FOUND OR v_session.store_id <> v_order.store_id
     OR v_session.payment_request_id IS NULL THEN
    RAISE EXCEPTION 'Refund source lacks a verified Xendit payment request';
  END IF;
  IF v_kind = 'deposit' THEN
    SELECT * INTO v_allocation FROM public.xendit_payment_session_deposits
      WHERE session_id = v_session.id;
    IF NOT FOUND OR v_allocation.deposit_php < v_payment.amount
       OR (v_allocation.order_id IS DISTINCT FROM p_order_id
         AND (v_allocation.raw_order_id IS NULL
           OR v_allocation.raw_order_id IS DISTINCT FROM v_payment.raw_order_id)) THEN
      RAISE EXCEPTION 'Refund source lacks a matching frozen deposit allocation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
        WHERE a.id = v_allocation.receiving_account_id AND a.is_active
          AND lower(a.account_type) = 'asset'
          AND a.store_id IN (v_order.store_id,'company'))
       OR NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
        WHERE a.id = v_allocation.liability_account_id AND a.is_active
          AND lower(a.account_type) = 'liability'
          AND a.store_id IN (v_order.store_id,'company')) THEN
      RAISE EXCEPTION 'Deposit refund accounts are missing or unavailable';
    END IF;
    SELECT * INTO v_decision FROM public.xendit_cancellation_decisions
      WHERE order_id = p_order_id FOR UPDATE;
    v_pending_charge := CASE WHEN v_decision.deposit_charge_status = 'pending_finance_review'
      THEN v_decision.deposit_charge_php ELSE 0 END;
  ELSE
    SELECT r.received_into_account_id INTO v_receiving
    FROM public.payment_routing_rules r
    JOIN public.chart_of_accounts a ON a.id = r.received_into_account_id
    WHERE r.store_id = v_order.store_id AND r.payment_method_id = 'xendit'
      AND a.is_active AND lower(a.account_type) = 'asset'
      AND a.store_id IN (v_order.store_id,'company');
    IF v_receiving IS NULL THEN
      RAISE EXCEPTION 'Xendit receiving account routing is not configured';
    END IF;
    SELECT min(j.account_id) INTO v_income
    FROM public.journal_entries j
    JOIN public.chart_of_accounts a ON a.id = j.account_id
    WHERE j.reference_type = 'order' AND j.reference_id = v_order.id
      AND j.credit > 0 AND a.is_active AND lower(a.account_type) = 'income'
      AND a.store_id IN (v_order.store_id,'company');
    IF v_income IS NULL OR (SELECT count(DISTINCT j.account_id)
        FROM public.journal_entries j
        JOIN public.chart_of_accounts a ON a.id = j.account_id
        WHERE j.reference_type = 'order' AND j.reference_id = v_order.id
          AND j.credit > 0 AND lower(a.account_type) = 'income') <> 1 THEN
      RAISE EXCEPTION 'Original rental income account is missing or ambiguous';
    END IF;
  END IF;
  SELECT COALESCE(sum(amount_php),0) INTO v_prior FROM public.xendit_refund_requests
    WHERE source_payment_id = p_source_payment_id
      AND status IN ('reserved','pending','succeeded','reconciliation_required');
  SELECT COALESCE(sum(amount_php),0) INTO v_session_refunded FROM public.xendit_refund_requests
    WHERE session_id = v_session.id
      AND status IN ('reserved','pending','succeeded','reconciliation_required');
  IF v_kind = 'deposit' THEN
    SELECT COALESCE(sum(amount),0) INTO v_manual_refunded FROM public.payments
      WHERE order_id = p_order_id AND payment_type = 'deposit_refund'
        AND payment_method_id IS DISTINCT FROM 'xendit';
    SELECT COALESCE(sum(debit),0) INTO v_applied FROM public.journal_entries
      WHERE reference_type = 'deposit' AND reference_id = p_order_id
        AND description ILIKE '%deposit applied%';
    SELECT COALESCE(sum(CASE
      WHEN payment_type IN ('deposit','security_deposit') THEN amount
      WHEN payment_type IN ('deposit_refund','deposit_applied') THEN -amount
      ELSE 0 END),0) INTO v_deposit_held
    FROM public.payments WHERE order_id = p_order_id
      AND payment_type IN ('deposit','security_deposit','deposit_refund','deposit_applied');
    SELECT COALESCE(sum(amount_php),0) INTO v_deposit_unresolved
    FROM public.xendit_refund_requests
    WHERE order_id = p_order_id AND kind = 'deposit'
      AND status IN ('reserved','pending','reconciliation_required');
    IF p_amount_php > v_deposit_held - v_deposit_unresolved - v_pending_charge THEN
      RAISE EXCEPTION 'Refund exceeds unallocated held deposit after pending refunds and charges';
    END IF;
  ELSE
    v_manual_refunded := 0;
    v_applied := 0;
  END IF;
  IF v_prior + v_manual_refunded + v_applied + p_amount_php > v_payment.amount
     OR v_session_refunded + p_amount_php > v_session.amount_php THEN
    RAISE EXCEPTION 'Refund exceeds remaining verified payment or deposit liability';
  END IF;
  INSERT INTO public.xendit_refund_requests(
    id,reference_id,order_id,source_payment_id,session_id,payment_request_id,
    amount_php,kind,reason,created_by
  ) VALUES (p_refund_id,p_reference_id,p_order_id,p_source_payment_id,v_session.id,
    v_session.payment_request_id,p_amount_php,v_kind,p_reason,p_employee_id);
  RETURN jsonb_build_object('refundId',p_refund_id,'referenceId',p_reference_id,
    'paymentRequestId',v_session.payment_request_id,'amountPHP',p_amount_php,'kind',v_kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_xendit_refund_requested_atomic(
  p_refund_id uuid,p_provider_refund_id text,p_provider_status text,p_payload jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.xendit_refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.xendit_refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund reservation not found'; END IF;
  IF v_row.status NOT IN ('reserved','pending') THEN RETURN v_row.status; END IF;
  IF p_provider_refund_id IS NULL OR btrim(p_provider_refund_id) = '' THEN
    RAISE EXCEPTION 'Provider refund id is required';
  END IF;
  UPDATE public.xendit_refund_requests SET provider_refund_id = p_provider_refund_id,
    status = CASE WHEN p_provider_status IN ('PENDING','SUCCEEDED')
      THEN 'pending' ELSE 'reconciliation_required' END,
    processing_error = CASE WHEN p_provider_status IN ('PENDING','SUCCEEDED')
      THEN NULL ELSE 'Provider returned a non-pending refund state; verify in Xendit' END,
    provider_payload = p_payload,updated_at = now()
  WHERE id = p_refund_id;
  RETURN CASE WHEN p_provider_status IN ('PENDING','SUCCEEDED')
    THEN 'pending' ELSE 'reconciliation_required' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_xendit_refund_uncertain_atomic(
  p_refund_id uuid,p_error text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.xendit_refund_requests SET status = 'reconciliation_required',
    processing_error = left(p_error,1000),updated_at = now()
  WHERE id = p_refund_id AND status IN ('reserved','pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_xendit_refund_atomic(
  p_reference_id text,p_provider_refund_id text,p_payment_request_id text,
  p_amount_php numeric,p_currency text,p_status text,p_event_key text,p_payload jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_refund public.xendit_refund_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_source public.payments%ROWTYPE;
  v_allocation public.xendit_payment_session_deposits%ROWTYPE;
  v_receiving text;
  v_debit text;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_payment_id text;
  v_error text;
BEGIN
  SELECT * INTO v_refund FROM public.xendit_refund_requests
    WHERE reference_id = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Xendit refund reference'; END IF;
  INSERT INTO public.xendit_webhook_events(event_key,event_type,session_id,payload,processing_status)
    VALUES(p_event_key,CASE WHEN p_status = 'SUCCEEDED' THEN 'refund.succeeded' ELSE 'refund.failed' END,
      v_refund.session_id,p_payload,'received') ON CONFLICT(event_key) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.xendit_webhook_events
      WHERE event_key = p_event_key AND session_id = v_refund.session_id
        AND event_type = CASE WHEN p_status = 'SUCCEEDED' THEN 'refund.succeeded' ELSE 'refund.failed' END
        AND payload = p_payload) THEN
    RAISE EXCEPTION 'Webhook event key belongs to a different Xendit refund';
  END IF;
  IF v_refund.status IN ('succeeded','failed') THEN RETURN false; END IF;
  IF p_provider_refund_id IS NULL OR btrim(p_provider_refund_id) = ''
     OR v_refund.provider_refund_id IS NOT NULL
        AND v_refund.provider_refund_id <> p_provider_refund_id
     OR (p_payment_request_id IS NOT NULL
       AND p_payment_request_id IS DISTINCT FROM v_refund.payment_request_id)
     OR p_amount_php IS DISTINCT FROM v_refund.amount_php
     OR p_currency IS DISTINCT FROM 'PHP'
     OR p_status NOT IN ('SUCCEEDED','FAILED') THEN
    v_error := 'Refund webhook does not match reserved provider refund';
  END IF;
  IF v_error IS NOT NULL THEN
    UPDATE public.xendit_refund_requests SET status = 'reconciliation_required',
      processing_error = v_error,provider_payload = p_payload,updated_at = now()
      WHERE id = v_refund.id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_error,processed_at = now() WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  IF p_status = 'FAILED' THEN
    UPDATE public.xendit_refund_requests SET status = 'failed',
      provider_refund_id = p_provider_refund_id,provider_payload = p_payload,updated_at = now()
      WHERE id = v_refund.id;
    UPDATE public.xendit_webhook_events SET processing_status = 'processed',processed_at = now()
      WHERE event_key = p_event_key;
    RETURN true;
  END IF;

  BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = v_refund.order_id FOR UPDATE;
    SELECT * INTO v_source FROM public.payments WHERE id = v_refund.source_payment_id FOR UPDATE;
    SELECT * INTO v_allocation FROM public.xendit_payment_session_deposits
      WHERE session_id = v_refund.session_id;
    IF v_order.id IS NULL OR v_source.id IS NULL OR v_source.order_id <> v_order.id THEN
      RAISE EXCEPTION 'Refund source changed before provider confirmation';
    END IF;
    IF v_refund.kind = 'deposit' THEN
      IF v_allocation.session_id IS NULL
         OR v_allocation.deposit_php < v_source.amount
         OR (v_allocation.order_id IS DISTINCT FROM v_order.id
           AND (v_allocation.raw_order_id IS NULL
             OR v_allocation.raw_order_id IS DISTINCT FROM v_source.raw_order_id)) THEN
        RAISE EXCEPTION 'Deposit allocation is missing or changed';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
          WHERE a.id = v_allocation.receiving_account_id AND a.is_active
            AND lower(a.account_type) = 'asset'
            AND a.store_id IN (v_order.store_id,'company'))
         OR NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
          WHERE a.id = v_allocation.liability_account_id AND a.is_active
            AND lower(a.account_type) = 'liability'
            AND a.store_id IN (v_order.store_id,'company')) THEN
        RAISE EXCEPTION 'Deposit refund accounts changed after reservation';
      END IF;
      v_debit := v_allocation.liability_account_id;
      v_receiving := v_allocation.receiving_account_id;
    ELSE
      SELECT r.received_into_account_id INTO v_receiving
      FROM public.payment_routing_rules r
      JOIN public.chart_of_accounts a ON a.id = r.received_into_account_id
      WHERE r.store_id = v_order.store_id AND r.payment_method_id = 'xendit'
        AND a.is_active AND lower(a.account_type) = 'asset'
        AND a.store_id IN (v_order.store_id,'company');
      IF v_receiving IS NULL THEN RAISE EXCEPTION 'Xendit receiving account routing is not configured'; END IF;
      SELECT min(j.account_id) INTO v_debit
      FROM public.journal_entries j
      JOIN public.chart_of_accounts a ON a.id = j.account_id
      WHERE j.reference_type = 'order' AND j.reference_id = v_order.id
        AND j.credit > 0 AND a.is_active AND lower(a.account_type) = 'income'
        AND a.store_id IN (v_order.store_id,'company');
      IF v_debit IS NULL OR (SELECT count(DISTINCT j.account_id)
          FROM public.journal_entries j
          JOIN public.chart_of_accounts a ON a.id = j.account_id
          WHERE j.reference_type = 'order' AND j.reference_id = v_order.id
            AND j.credit > 0 AND lower(a.account_type) = 'income') <> 1 THEN
        RAISE EXCEPTION 'Original rental income account is missing or ambiguous';
      END IF;
    END IF;
    v_payment_id := 'PAY-XENDIT-REFUND-' || md5(p_reference_id);
    INSERT INTO public.payments(id,order_id,store_id,amount,payment_type,payment_method_id,
      transaction_date,customer_id,account_id,settlement_ref)
    VALUES(v_payment_id,v_order.id,v_order.store_id,v_refund.amount_php,
      CASE WHEN v_refund.kind = 'deposit' THEN 'deposit_refund' ELSE 'refund' END,
      'xendit',v_date,v_order.customer_id,v_receiving,p_provider_refund_id);
    INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,
      debit,credit,description,reference_type,reference_id,created_by)
    VALUES
      (gen_random_uuid()::text,v_refund.id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_order.store_id,v_debit,v_refund.amount_php,0,'Xendit refund liability/revenue reversal',
        'refund',v_payment_id,v_refund.created_by),
      (gen_random_uuid()::text,v_refund.id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_order.store_id,v_receiving,0,v_refund.amount_php,'Xendit refund to customer',
        'refund',v_payment_id,v_refund.created_by);
    IF v_refund.kind = 'rental' AND v_order.status = 'active' THEN
      UPDATE public.orders SET balance_due = balance_due + v_refund.amount_php,updated_at = now()
        WHERE id = v_order.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_error := left('Refund posting failed: ' || SQLERRM,1000);
  END;
  IF v_error IS NOT NULL THEN
    UPDATE public.xendit_refund_requests SET status = 'reconciliation_required',
      processing_error = v_error,provider_payload = p_payload,updated_at = now()
      WHERE id = v_refund.id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_error,processed_at = now() WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  UPDATE public.xendit_refund_requests SET status = 'succeeded',
    provider_refund_id = p_provider_refund_id,provider_payload = p_payload,
    processing_error = NULL,updated_at = now() WHERE id = v_refund.id;
  UPDATE public.xendit_webhook_events SET processing_status = 'processed',processed_at = now()
    WHERE event_key = p_event_key;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_xendit_order_with_refunds_atomic(
  p_order_id text,p_reason text,p_employee_id text,p_refunds jsonb,
  p_deposit_charge_php numeric,p_deposit_charge_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_refund jsonb;
  v_reservation jsonb;
  v_reservations jsonb := '[]'::jsonb;
  v_source public.payments%ROWTYPE;
  v_deposit_held numeric(12,2);
  v_deposit_refund numeric(12,2) := 0;
  v_pending_deposit_refund numeric(12,2) := 0;
  v_cancel jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active order can be cancelled';
  END IF;
  IF length(btrim(p_reason)) < 10 OR length(btrim(p_reason)) > 500
     OR jsonb_typeof(p_refunds) <> 'array'
     OR p_deposit_charge_php IS NULL OR p_deposit_charge_php < 0
     OR p_deposit_charge_php <> round(p_deposit_charge_php,2) THEN
    RAISE EXCEPTION 'Cancellation decision is invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_payment_sessions
      WHERE order_id = p_order_id AND status IN ('creating','active','reconciliation_required')) THEN
    RAISE EXCEPTION 'Resolve the live or disputed checkout before cancellation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_refund_requests
      WHERE order_id = p_order_id AND status = 'reconciliation_required') THEN
    RAISE EXCEPTION 'Resolve uncertain refund requests before cancellation';
  END IF;
  SELECT COALESCE(sum(CASE WHEN payment_type = 'deposit_refund' THEN -amount ELSE amount END),0)
    INTO v_deposit_held FROM public.payments
    WHERE order_id = p_order_id AND payment_type IN ('deposit','security_deposit','deposit_refund');
  IF v_deposit_held <> COALESCE((SELECT sum(CASE WHEN p.payment_type = 'deposit_refund' THEN -p.amount ELSE p.amount END)
      FROM public.payments p WHERE p.order_id = p_order_id AND p.payment_method_id = 'xendit'
        AND p.payment_type IN ('deposit','deposit_refund')),0) THEN
    RAISE EXCEPTION 'Mixed manual and online deposits need finance review before cancellation';
  END IF;
  SELECT COALESCE(sum(amount_php),0) INTO v_pending_deposit_refund
  FROM public.xendit_refund_requests
  WHERE order_id = p_order_id AND kind = 'deposit' AND status IN ('reserved','pending');
  FOR v_refund IN SELECT value FROM jsonb_array_elements(p_refunds) LOOP
    SELECT * INTO v_source FROM public.payments WHERE id = v_refund->>'sourcePaymentId' FOR UPDATE;
    IF NOT FOUND OR v_source.order_id <> p_order_id THEN
      RAISE EXCEPTION 'Cancellation refund source does not belong to this order';
    END IF;
    IF v_source.payment_type = 'deposit' THEN
      v_deposit_refund := v_deposit_refund + (v_refund->>'amountPHP')::numeric;
    END IF;
    v_reservation := public.reserve_xendit_refund_atomic(
      (v_refund->>'refundId')::uuid,v_refund->>'referenceId',p_order_id,
      v_refund->>'sourcePaymentId',(v_refund->>'amountPHP')::numeric,
      p_reason,p_employee_id);
    v_reservations := v_reservations || jsonb_build_array(v_reservation);
  END LOOP;
  IF v_pending_deposit_refund + v_deposit_refund + p_deposit_charge_php <> v_deposit_held THEN
    RAISE EXCEPTION 'Every held deposit peso needs a refund request or documented charge';
  END IF;
  IF p_deposit_charge_php > 0 AND
      (length(btrim(COALESCE(p_deposit_charge_reason,''))) < 10
       OR length(btrim(p_deposit_charge_reason)) > 500) THEN
    RAISE EXCEPTION 'A retained deposit requires a 10-500 character documented charge';
  END IF;
  v_cancel := public.cancel_activated_order_atomic(p_order_id,now(),p_reason,p_employee_id);
  IF COALESCE((v_cancel->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Order cancellation failed: %',v_cancel->>'error';
  END IF;
  INSERT INTO public.xendit_cancellation_decisions(
    order_id,cancelled_by,reason,deposit_charge_php,deposit_charge_reason,deposit_charge_status)
  VALUES(p_order_id,p_employee_id,p_reason,p_deposit_charge_php,p_deposit_charge_reason,
    CASE WHEN p_deposit_charge_php > 0 THEN 'pending_finance_review' ELSE 'not_applicable' END);
  RETURN jsonb_build_object('cancelled',true,'refunds',v_reservations,
    'depositChargePendingFinancePHP',p_deposit_charge_php);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_xendit_cancellation_deposit_charge_atomic(
  p_order_id text,p_income_account_id text,p_employee_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_decision public.xendit_cancellation_decisions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_liability_id text;
  v_deposit_held numeric(12,2);
  v_deposit_unresolved numeric(12,2);
  v_payment_id text := 'PAY-XENDIT-DEPOSIT-APPLIED-' || md5(p_order_id);
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Only a cancelled order can resolve its deposit charge';
  END IF;
  SELECT * INTO v_decision FROM public.xendit_cancellation_decisions
    WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cancellation deposit decision not found'; END IF;
  IF v_decision.deposit_charge_status = 'resolved' THEN
    RETURN jsonb_build_object('status','resolved','amountPHP',v_decision.deposit_charge_php);
  END IF;
  IF v_decision.deposit_charge_status <> 'pending_finance_review'
     OR v_decision.deposit_charge_php <= 0
     OR length(btrim(COALESCE(v_decision.deposit_charge_reason,''))) < 10 THEN
    RAISE EXCEPTION 'No documented deposit charge awaits finance review';
  END IF;
  SELECT COALESCE(sum(CASE
    WHEN payment_type IN ('deposit','security_deposit') THEN amount
    WHEN payment_type IN ('deposit_refund','deposit_applied') THEN -amount
    ELSE 0 END),0) INTO v_deposit_held
  FROM public.payments WHERE order_id = p_order_id
    AND payment_type IN ('deposit','security_deposit','deposit_refund','deposit_applied');
  SELECT COALESCE(sum(amount_php),0) INTO v_deposit_unresolved
  FROM public.xendit_refund_requests
  WHERE order_id = p_order_id AND kind = 'deposit'
    AND status IN ('reserved','pending','reconciliation_required');
  IF v_decision.deposit_charge_php > v_deposit_held - v_deposit_unresolved THEN
    RAISE EXCEPTION 'Documented charge exceeds unallocated held deposit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
    WHERE a.id = p_income_account_id AND a.store_id IN (v_order.store_id,'company')
      AND a.is_active AND lower(a.account_type) = 'income') THEN
    RAISE EXCEPTION 'Select an active store-accessible income account';
  END IF;
  SELECT min(d.liability_account_id) INTO v_liability_id
  FROM public.xendit_payment_session_deposits d
  JOIN public.xendit_payment_sessions s ON s.id = d.session_id
  JOIN public.payments p ON p.settlement_ref = s.payment_id
  WHERE p.order_id = p_order_id AND p.payment_type = 'deposit'
    AND p.payment_method_id = 'xendit' AND p.settlement_ref IS NOT NULL;
  IF v_liability_id IS NULL OR EXISTS (
    SELECT 1 FROM public.xendit_payment_session_deposits d
    JOIN public.xendit_payment_sessions s ON s.id = d.session_id
    JOIN public.payments p ON p.settlement_ref = s.payment_id
    WHERE p.order_id = p_order_id AND p.payment_type = 'deposit'
      AND p.payment_method_id = 'xendit' AND d.liability_account_id <> v_liability_id
  ) THEN RAISE EXCEPTION 'Deposit liability account is ambiguous'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
      WHERE a.id = v_liability_id AND a.is_active
        AND lower(a.account_type) = 'liability'
        AND a.store_id IN (v_order.store_id,'company')) THEN
    RAISE EXCEPTION 'Deposit liability account is unavailable for charge resolution';
  END IF;
  INSERT INTO public.payments(id,store_id,order_id,payment_type,amount,payment_method_id,
    transaction_date,customer_id,settlement_status)
  VALUES(v_payment_id,v_order.store_id,p_order_id,'deposit_applied',v_decision.deposit_charge_php,
    'xendit',v_date,v_order.customer_id,'applied');
  INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,
    debit,credit,description,reference_type,reference_id,created_by)
  VALUES
    (gen_random_uuid()::text,v_payment_id,to_char(v_date,'YYYY-MM'),v_date,v_order.store_id,
      v_liability_id,v_decision.deposit_charge_php,0,
      'Apply documented Xendit deposit charge: ' || v_decision.deposit_charge_reason,
      'deposit',p_order_id,p_employee_id),
    (gen_random_uuid()::text,v_payment_id,to_char(v_date,'YYYY-MM'),v_date,v_order.store_id,
      p_income_account_id,0,v_decision.deposit_charge_php,
      'Documented Xendit deposit charge income','deposit',p_order_id,p_employee_id);
  UPDATE public.orders SET final_total = COALESCE(final_total,0) + v_decision.deposit_charge_php,
    return_charges = COALESCE(return_charges,0) + v_decision.deposit_charge_php,
    return_charges_note = v_decision.deposit_charge_reason,updated_at = now()
  WHERE id = p_order_id;
  UPDATE public.xendit_cancellation_decisions SET deposit_charge_status = 'resolved'
    WHERE order_id = p_order_id;
  RETURN jsonb_build_object('status','resolved','amountPHP',v_decision.deposit_charge_php);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_xendit_refund_atomic(uuid,text,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_xendit_refund_requested_atomic(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_xendit_refund_uncertain_atomic(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_xendit_refund_atomic(text,text,text,numeric,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_xendit_order_with_refunds_atomic(text,text,text,jsonb,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_xendit_cancellation_deposit_charge_atomic(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_xendit_refund_atomic(uuid,text,text,text,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_xendit_refund_requested_atomic(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_xendit_refund_uncertain_atomic(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_xendit_refund_atomic(text,text,text,numeric,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_xendit_order_with_refunds_atomic(text,text,text,jsonb,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_xendit_cancellation_deposit_charge_atomic(text,text,text) TO service_role;

DO $verify$
DECLARE v_signature text;
BEGIN
  IF to_regclass('public.xendit_payment_session_deposits') IS NULL
    OR to_regclass('public.xendit_refund_requests') IS NULL
    OR to_regprocedure('public.complete_xendit_session_phase2_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
    OR NOT has_function_privilege('service_role',
      'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)','EXECUTE')
    OR has_function_privilege('anon',
      'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.create_xendit_raw_deposit_draft(uuid,text,uuid,text,text,text,numeric)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.complete_xendit_refund_atomic(text,text,text,numeric,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Phase 3 installation verification failed';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.confirm_extend_order_guarded_atomic(jsonb)',
    'public.resolve_xendit_deposit_accounts(text)',
    'public.create_xendit_order_deposit_draft(uuid,text,text,text,text,text,boolean)',
    'public.create_xendit_raw_deposit_draft(uuid,text,uuid,text,text,text,numeric)',
    'public.reserve_xendit_refund_atomic(uuid,text,text,text,numeric,text,text)',
    'public.mark_xendit_refund_requested_atomic(uuid,text,text,jsonb)',
    'public.mark_xendit_refund_uncertain_atomic(uuid,text)',
    'public.complete_xendit_refund_atomic(text,text,text,numeric,text,text,text,jsonb)',
    'public.cancel_xendit_order_with_refunds_atomic(text,text,text,jsonb,numeric,text)',
    'public.resolve_xendit_cancellation_deposit_charge_atomic(text,text,text)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL
       OR NOT has_function_privilege('service_role',v_signature,'EXECUTE')
       OR has_function_privilege('anon',v_signature,'EXECUTE')
       OR has_function_privilege('authenticated',v_signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Phase 3 function privilege contract failed: %',v_signature;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c
      WHERE c.oid IN ('public.xendit_payment_session_deposits'::regclass,
        'public.xendit_refund_requests'::regclass,'public.xendit_cancellation_decisions'::regclass)
        AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Phase 3 tables must have row-level security enabled';
  END IF;
  IF has_table_privilege('anon','public.xendit_refund_requests','SELECT')
    OR has_table_privilege('authenticated','public.xendit_refund_requests','SELECT')
    OR NOT has_table_privilege('service_role','public.xendit_refund_requests','SELECT') THEN
    RAISE EXCEPTION 'Phase 3 refund table privileges are incorrect';
  END IF;
END;
$verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
