-- Run manually after apply-xendit-schema.sql, on a backed-up staging database.
-- Never add this file to supabase/migrations. A failure rolls back the install.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('lolas-xendit-phase2'));

DO $preflight$
BEGIN
  IF to_regclass('public.xendit_payment_sessions') IS NULL
     OR to_regclass('public.xendit_payment_session_orders') IS NULL
     OR to_regclass('public.xendit_payment_session_extension_payments') IS NULL
     OR to_regprocedure('public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('public.create_xendit_raw_staff_session_draft(uuid,text,uuid,text,text,text,numeric)') IS NULL
     OR to_regprocedure('public.activate_order_atomic(text,text,text,text,text,date,text,text,integer,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,text,numeric,numeric,timestamp with time zone,jsonb,jsonb,jsonb,text,text,date,text,jsonb,text,numeric,date,text,numeric,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 requires the reviewed base Xendit installer and activation RPC';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.payment_type = 'addon' AND p.settlement_status = 'pending'
      AND p.order_addon_id IS NOT NULL
    GROUP BY p.order_addon_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Phase 2 cannot install with duplicate pending add-on IOUs';
  END IF;
END;
$preflight$;

ALTER TABLE public.xendit_payment_sessions
  DROP CONSTRAINT IF EXISTS xendit_payment_sessions_target_type_check;
ALTER TABLE public.xendit_payment_sessions
  ADD CONSTRAINT xendit_payment_sessions_target_type_check
  CHECK (target_type IN ('public_booking_group', 'staff_order', 'public_extension', 'staff_addon'));
ALTER TABLE public.xendit_payment_sessions
  DROP CONSTRAINT IF EXISTS xendit_session_target_matches;
ALTER TABLE public.xendit_payment_sessions
  ADD CONSTRAINT xendit_session_target_matches
  CHECK (
    (target_type IN ('staff_order', 'public_extension', 'staff_addon') AND order_id IS NOT NULL)
    OR (target_type = 'public_booking_group' AND order_id IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.xendit_payment_session_addon_payments (
  session_id uuid NOT NULL REFERENCES public.xendit_payment_sessions(id) ON DELETE CASCADE,
  addon_payment_id text NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  principal_amount_php numeric(12,2) NOT NULL CHECK (principal_amount_php > 0),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, addon_payment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_live_addon_payment_claim
  ON public.xendit_payment_session_addon_payments(addon_payment_id)
  WHERE released_at IS NULL;
ALTER TABLE public.xendit_payment_session_addon_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.xendit_payment_session_addon_payments;
CREATE POLICY "Service role full access" ON public.xendit_payment_session_addon_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Prevent a generic staff-order checkout from collecting an add-on IOU without
-- absorbing that IOU. Also catches callers that bypass the HTTP route.
CREATE OR REPLACE FUNCTION public.guard_xendit_staff_order_addon_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.target_type = 'staff_order' AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = NEW.order_id AND p.payment_type = 'addon'
      AND p.settlement_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Unresolved add-on IOUs require a dedicated Xendit link';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_xendit_staff_order_addons ON public.xendit_payment_sessions;
CREATE TRIGGER trg_guard_xendit_staff_order_addons
  BEFORE INSERT ON public.xendit_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_xendit_staff_order_addon_balance();

-- Claim release is tied to an actual terminal state transition, including
-- provider-confirmed cancellation and expiry through the existing RPCs.
CREATE OR REPLACE FUNCTION public.release_xendit_phase2_claims()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('creating', 'active')
     AND NEW.status IN ('failed', 'expired', 'cancelled') THEN
    UPDATE public.xendit_payment_session_addon_payments
    SET released_at = COALESCE(released_at, now())
    WHERE session_id = NEW.id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_release_xendit_phase2_claims ON public.xendit_payment_sessions;
CREATE TRIGGER trg_release_xendit_phase2_claims
  AFTER UPDATE OF status ON public.xendit_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.release_xendit_phase2_claims();

-- The live activation RPC may differ from repository migration history. Wrap
-- only its rental-payment insert, and abort if its body is unfamiliar.
DO $activation_patch$
DECLARE
  definition text;
  rental_insert text := $payment$
  -- 6. Insert rental payment
  INSERT INTO public.payments (
    id, order_id, store_id, amount, payment_type,
    payment_method_id, transaction_date, customer_id
  ) VALUES (
    p_rental_payment_id,
    p_order_id,
    p_store_id,
    p_rental_amount,
    'rental',
    p_payment_method_id,
    p_transaction_date,
    p_customer_id
  );
$payment$;
  guarded_insert text := $payment$
  -- 6. Insert rental payment
  IF p_rental_payment_id IS NOT NULL THEN
    INSERT INTO public.payments (
      id, order_id, store_id, amount, payment_type,
      payment_method_id, transaction_date, customer_id
    ) VALUES (
      p_rental_payment_id,
      p_order_id,
      p_store_id,
      p_rental_amount,
      'rental',
      p_payment_method_id,
      p_transaction_date,
      p_customer_id
    );
  END IF;
$payment$;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.activate_order_atomic(text,text,text,text,text,date,text,text,integer,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,text,numeric,numeric,timestamp with time zone,jsonb,jsonb,jsonb,text,text,date,text,jsonb,text,numeric,date,text,numeric,boolean)'
  )) INTO definition;
  definition := replace(definition, E'\r\n', E'\n');
  IF length(definition) - length(replace(definition, guarded_insert, '')) = length(guarded_insert)
     AND position(rental_insert IN definition) = 0 THEN
    RETURN;
  END IF;
  IF length(definition) - length(replace(definition, rental_insert, '')) <> length(rental_insert)
     OR position('IF p_rental_payment_id IS NOT NULL THEN' IN definition) > 0 THEN
    RAISE EXCEPTION 'Activation RPC differs from reviewed rental-payment insert; inspect staging definition before Phase 2 installation';
  END IF;
  definition := replace(definition, rental_insert, guarded_insert);
  EXECUTE definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.activate_order_atomic(text,text,text,text,text,date,text,text,integer,numeric,numeric,text,numeric,numeric,numeric,numeric,text,text,text,numeric,numeric,timestamp with time zone,jsonb,jsonb,jsonb,text,text,date,text,jsonb,text,numeric,date,text,numeric,boolean)'
  )) INTO definition;
  definition := replace(definition, E'\r\n', E'\n');
  IF length(definition) - length(replace(definition, guarded_insert, '')) <> length(guarded_insert)
     OR position(rental_insert IN definition) > 0 THEN
    RAISE EXCEPTION 'Activation RPC rental-payment guard was not installed';
  END IF;
END;
$activation_patch$;

CREATE OR REPLACE FUNCTION public.create_online_addons_atomic(
  p_order_id text, p_store_id text, p_addons jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_row record;
  requested jsonb;
  configured record;
  rental_days integer;
  quantity integer;
  unit_price numeric(12,2);
  line_total numeric(12,2);
  principal numeric(12,2) := 0;
  addon_row_id text;
  count_added integer := 0;
  selected_ids integer[] := ARRAY[]::integer[];
  selected_groups text[] := ARRAY[]::text[];
BEGIN
  SELECT id, store_id, status INTO order_row
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR order_row.store_id <> p_store_id OR order_row.status <> 'active' THEN
    RAISE EXCEPTION 'Online add-on order is not active in this store';
  END IF;
  IF p_addons IS NULL OR jsonb_typeof(p_addons) <> 'array'
     OR jsonb_array_length(p_addons) < 1 OR jsonb_array_length(p_addons) > 20 THEN
    RAISE EXCEPTION 'Select between 1 and 20 configured add-ons';
  END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_payment_sessions
             WHERE order_id = p_order_id
               AND status IN ('creating', 'active', 'reconciliation_required')) THEN
    RAISE EXCEPTION 'Order already has an unresolved Xendit session';
  END IF;
  SELECT max(COALESCE(NULLIF(oi.rental_days_count, 0), NULLIF(oi.rental_days, 0),
    GREATEST(1, ceil(EXTRACT(EPOCH FROM (oi.dropoff_datetime - oi.pickup_datetime)) / 86400)::integer)))
  INTO rental_days FROM public.order_items oi WHERE oi.order_id = p_order_id;
  IF rental_days IS NULL OR rental_days < 1 THEN
    RAISE EXCEPTION 'Rental duration is unavailable for online add-ons';
  END IF;

  FOR requested IN SELECT value FROM jsonb_array_elements(p_addons) AS input(value) LOOP
    IF jsonb_typeof(requested) <> 'object'
       OR requested->>'id' IS NULL OR requested->>'quantity' IS NULL THEN
      RAISE EXCEPTION 'Invalid add-on selection';
    END IF;
    quantity := (requested->>'quantity')::integer;
    IF quantity < 1 OR quantity > 20 THEN
      RAISE EXCEPTION 'Invalid add-on quantity';
    END IF;
    SELECT id, name, addon_type, price_per_day, price_one_time,
           store_id, mutual_exclusivity_group
    INTO configured FROM public.addons
    WHERE id = (requested->>'id')::integer AND is_active = true;
    IF NOT FOUND OR (configured.store_id IS NOT NULL AND configured.store_id <> p_store_id) THEN
      RAISE EXCEPTION 'Add-on is unavailable in this store';
    END IF;
    IF configured.id = ANY(selected_ids)
       OR EXISTS (SELECT 1 FROM public.order_addons existing
                  WHERE existing.order_id = p_order_id
                    AND lower(existing.addon_name) = lower(configured.name)) THEN
      RAISE EXCEPTION 'This add-on is already on the order';
    END IF;
    selected_ids := array_append(selected_ids, configured.id);
    IF configured.mutual_exclusivity_group IS NOT NULL THEN
      IF configured.mutual_exclusivity_group = ANY(selected_groups)
         OR EXISTS (
           SELECT 1 FROM public.order_addons existing
           JOIN public.addons catalog ON lower(catalog.name) = lower(existing.addon_name)
           WHERE existing.order_id = p_order_id
             AND catalog.mutual_exclusivity_group = configured.mutual_exclusivity_group
         ) THEN
        RAISE EXCEPTION 'Mutually exclusive add-ons cannot be combined';
      END IF;
      selected_groups := array_append(selected_groups, configured.mutual_exclusivity_group);
    END IF;
    unit_price := CASE WHEN configured.addon_type = 'per_day'
      THEN configured.price_per_day ELSE configured.price_one_time END;
    line_total := round(unit_price * quantity *
      CASE WHEN configured.addon_type = 'per_day' THEN rental_days ELSE 1 END, 2);
    IF line_total <= 0 THEN RAISE EXCEPTION 'Add-on price must be positive'; END IF;
    addon_row_id := gen_random_uuid()::text;
    INSERT INTO public.order_addons (
      id, order_id, store_id, addon_name, addon_price, addon_type, quantity, total_amount
    ) VALUES (
      addon_row_id, p_order_id, p_store_id, configured.name, unit_price,
      configured.addon_type, quantity, line_total
    );
    INSERT INTO public.payments (
      id, order_id, store_id, order_addon_id, amount, payment_type,
      payment_method_id, transaction_date, settlement_status
    ) VALUES (
      gen_random_uuid()::text, p_order_id, p_store_id, addon_row_id, line_total,
      'addon', 'xendit', (now() AT TIME ZONE 'Asia/Manila')::date, 'pending'
    );
    principal := principal + line_total;
    count_added := count_added + 1;
  END LOOP;
  UPDATE public.orders
  SET final_total = COALESCE(final_total, 0) + principal,
      balance_due = COALESCE(balance_due, 0) + principal,
      updated_at = now()
  WHERE id = p_order_id;
  RETURN jsonb_build_object('principalPHP', principal, 'count', count_added);
END;
$$;
REVOKE ALL ON FUNCTION public.create_online_addons_atomic(text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_addons_atomic(text,text,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_xendit_addon_session_draft(
  p_session_id uuid, p_reference_id text, p_order_id text,
  p_store_id text, p_payment_method_id text, p_created_by text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_row record;
  method record;
  pending record;
  principal numeric(12,2) := 0;
  surcharge numeric(12,2);
  payment_count integer := 0;
BEGIN
  SELECT id, store_id, status, balance_due INTO order_row
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR order_row.store_id <> p_store_id OR order_row.status <> 'active' THEN
    RAISE EXCEPTION 'Add-on payment order is no longer active';
  END IF;
  SELECT id, surcharge_percent INTO method FROM public.payment_methods
  WHERE id = p_payment_method_id AND is_active = true AND gateway_provider = 'xendit';
  IF NOT FOUND THEN RAISE EXCEPTION 'Xendit payment method is unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_payment_sessions
             WHERE order_id = p_order_id
               AND status IN ('creating','active','reconciliation_required')) THEN
    RAISE EXCEPTION 'Order already has an unresolved Xendit session';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments
             WHERE order_id = p_order_id AND payment_type = 'addon'
               AND settlement_status = 'pending'
               AND (order_addon_id IS NULL OR payment_method_id IS DISTINCT FROM p_payment_method_id)) THEN
    RAISE EXCEPTION 'Legacy add-on IOUs require staff review';
  END IF;

  FOR pending IN
    SELECT p.id, p.amount, p.order_addon_id, a.total_amount
    FROM public.payments p
    JOIN public.order_addons a ON a.id = p.order_addon_id AND a.order_id = p_order_id
    WHERE p.order_id = p_order_id AND p.payment_type = 'addon'
      AND p.settlement_status = 'pending' AND p.payment_method_id = p_payment_method_id
    ORDER BY p.id FOR UPDATE OF p
  LOOP
    IF pending.amount <= 0 OR pending.amount <> pending.total_amount
       OR EXISTS (SELECT 1 FROM public.xendit_payment_session_addon_payments claim
                  WHERE claim.addon_payment_id = pending.id AND claim.released_at IS NULL) THEN
      RAISE EXCEPTION 'Pending add-on IOU cannot be claimed';
    END IF;
    principal := principal + pending.amount;
    payment_count := payment_count + 1;
  END LOOP;
  IF payment_count = 0 OR principal <= 0 OR principal > COALESCE(order_row.balance_due, 0) THEN
    RAISE EXCEPTION 'No payable add-on balance is available';
  END IF;
  surcharge := round(principal * COALESCE(method.surcharge_percent, 0) / 100, 2);
  INSERT INTO public.xendit_payment_sessions (
    id, reference_id, target_type, order_id, store_id, payment_method_id,
    principal_amount_php, surcharge_amount_php, amount_php, created_by
  ) VALUES (
    p_session_id, p_reference_id, 'staff_addon', p_order_id, p_store_id,
    p_payment_method_id, principal, surcharge, principal + surcharge, p_created_by
  );
  INSERT INTO public.xendit_payment_session_addon_payments (
    session_id, addon_payment_id, principal_amount_php
  )
  SELECT p_session_id, p.id, p.amount
  FROM public.payments p
  WHERE p.order_id = p_order_id AND p.payment_type = 'addon'
    AND p.settlement_status = 'pending' AND p.payment_method_id = p_payment_method_id
    AND p.order_addon_id IS NOT NULL;
  RETURN jsonb_build_object('principalPHP', principal, 'surchargePHP', surcharge,
    'amountPHP', principal + surcharge);
END;
$$;
REVOKE ALL ON FUNCTION public.create_xendit_addon_session_draft(uuid,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_addon_session_draft(uuid,text,text,text,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_xendit_walkin_staff_session_draft(
  p_session_id uuid, p_reference_id text, p_raw_order_id uuid,
  p_store_id text, p_payment_method_id text, p_created_by text,
  p_expected_amount_php numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  booking record;
  method record;
  principal numeric(12,2);
  surcharge numeric(12,2);
BEGIN
  SELECT id, store_id, status, booking_channel, web_quote_raw,
         web_card_fee_surcharge, web_payment_method, xendit_payment_session_id
  INTO booking FROM public.orders_raw WHERE id = p_raw_order_id FOR UPDATE;
  IF NOT FOUND OR booking.store_id <> p_store_id
     OR booking.status <> 'unprocessed' OR booking.booking_channel <> 'walk_in'
     OR booking.xendit_payment_session_id IS NOT NULL
     OR booking.web_quote_raw IS NULL OR booking.web_quote_raw <= 0 THEN
    RAISE EXCEPTION 'Walk-in reservation is no longer payable';
  END IF;
  SELECT id, surcharge_percent INTO method FROM public.payment_methods
  WHERE id = p_payment_method_id AND is_active = true AND gateway_provider = 'xendit';
  IF NOT FOUND THEN RAISE EXCEPTION 'Xendit payment method is unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments p
             WHERE p.raw_order_id = p_raw_order_id
               AND p.payment_type IN ('pre-activation', 'card_xendit'))
     OR EXISTS (
       SELECT 1 FROM public.xendit_payment_session_orders allocation
       JOIN public.xendit_payment_sessions session ON session.id = allocation.session_id
       WHERE allocation.raw_order_id = p_raw_order_id
         AND session.status IN ('creating', 'active', 'reconciliation_required')
     ) THEN
    RAISE EXCEPTION 'Walk-in reservation has a payment or unresolved checkout';
  END IF;
  principal := booking.web_quote_raw - COALESCE(booking.web_card_fee_surcharge, 0);
  IF principal <= 0 THEN RAISE EXCEPTION 'Walk-in rental quote is invalid'; END IF;
  surcharge := CASE WHEN booking.web_payment_method = p_payment_method_id
    THEN COALESCE(booking.web_card_fee_surcharge, 0)
    ELSE round(principal * COALESCE(method.surcharge_percent, 0) / 100, 2) END;
  IF principal + surcharge <> p_expected_amount_php THEN
    RAISE EXCEPTION 'Walk-in reservation quote changed before checkout';
  END IF;
  INSERT INTO public.xendit_payment_sessions (
    id, reference_id, target_type, store_id, payment_method_id,
    principal_amount_php, surcharge_amount_php, amount_php, created_by
  ) VALUES (
    p_session_id, p_reference_id, 'public_booking_group', p_store_id,
    p_payment_method_id, principal, surcharge, principal + surcharge, p_created_by
  );
  UPDATE public.orders_raw
  SET web_payment_method = p_payment_method_id,
      web_quote_raw = principal + surcharge,
      web_card_fee_surcharge = surcharge,
      xendit_payment_session_id = p_session_id
  WHERE id = p_raw_order_id;
  INSERT INTO public.xendit_payment_session_orders (
    session_id, raw_order_id, principal_amount_php,
    surcharge_amount_php, amount_php
  ) VALUES (p_session_id, p_raw_order_id, principal, surcharge, principal + surcharge);
  RETURN jsonb_build_object('principalPHP', principal, 'surchargePHP', surcharge,
    'amountPHP', principal + surcharge);
END;
$$;
REVOKE ALL ON FUNCTION public.create_xendit_walkin_staff_session_draft(uuid,text,uuid,text,text,text,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_walkin_staff_session_draft(uuid,text,uuid,text,text,text,numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_xendit_full_rental_session_draft(
  p_session_id uuid, p_reference_id text, p_order_id text,
  p_store_id text, p_payment_method_id text, p_created_by text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_row record;
  method record;
  principal numeric(12,2);
  surcharge numeric(12,2);
BEGIN
  SELECT id, store_id, status, payment_method_id, balance_due INTO order_row
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR order_row.store_id <> p_store_id
     OR order_row.status <> 'active' OR order_row.payment_method_id <> p_payment_method_id THEN
    RAISE EXCEPTION 'Rental order is no longer payable by card';
  END IF;
  SELECT id, surcharge_percent INTO method FROM public.payment_methods
  WHERE id = p_payment_method_id AND is_active = true AND gateway_provider = 'xendit';
  IF NOT FOUND THEN RAISE EXCEPTION 'Xendit payment method is unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments
             WHERE order_id = p_order_id AND payment_type = 'addon'
               AND settlement_status = 'pending')
     OR EXISTS (SELECT 1 FROM public.payments
                WHERE order_id = p_order_id
                  AND payment_type IN ('rental', 'card_xendit')) THEN
    RAISE EXCEPTION 'Rental link requires an unpaid order without add-on IOUs';
  END IF;
  principal := order_row.balance_due;
  IF principal <= 0 THEN RAISE EXCEPTION 'Rental order has no payable balance'; END IF;
  surcharge := round(principal * COALESCE(method.surcharge_percent, 0) / 100, 2);
  PERFORM public.create_xendit_session_draft(
    p_session_id,p_reference_id,'staff_order',p_order_id,p_store_id,
    p_payment_method_id,principal,surcharge,principal + surcharge,p_created_by,'[]'::jsonb
  );
  RETURN jsonb_build_object('principalPHP',principal,'surchargePHP',surcharge,
    'amountPHP',principal + surcharge);
END;
$$;
REVOKE ALL ON FUNCTION public.create_xendit_full_rental_session_draft(uuid,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_full_rental_session_draft(uuid,text,text,text,text,text)
  TO service_role;

-- Reserve the old completion implementation under a stable internal name.
-- The wrapper below dispatches only Phase 2 targets to new code.
DO $rename_completion$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)'
  )) INTO current_definition;
  IF to_regprocedure('public.complete_xendit_session_phase1_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL THEN
    ALTER FUNCTION public.complete_xendit_session_atomic(
      uuid,text,text,jsonb,text,text,text,numeric,text
    ) RENAME TO complete_xendit_session_phase1_atomic;
  ELSIF position('RETURN public.complete_xendit_session_phase1_atomic(' IN current_definition) = 0 THEN
    EXECUTE replace(current_definition,
      'FUNCTION public.complete_xendit_session_atomic(',
      'FUNCTION public.complete_xendit_session_phase1_atomic(');
  END IF;
END;
$rename_completion$;
REVOKE ALL ON FUNCTION public.complete_xendit_session_phase1_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_phase1_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_xendit_session_atomic(
  p_session_id uuid, p_event_key text, p_event_type text, p_payload jsonb,
  p_payment_session_id text, p_payment_request_id text, p_payment_id text,
  p_amount_php numeric, p_currency text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  session_row public.xendit_payment_sessions%ROWTYPE;
  addon_claim record;
  raw_claim record;
  order_row record;
  claimed_count integer;
  locked_count integer := 0;
  updated_count integer;
  frozen_total numeric(12,2) := 0;
  payment_row_id text;
  rejection text;
BEGIN
  SELECT * INTO session_row FROM public.xendit_payment_sessions
  WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Xendit session not found'; END IF;

  IF session_row.target_type <> 'staff_addon' AND NOT (
    session_row.target_type = 'public_booking_group' AND session_row.created_by IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.xendit_payment_session_orders a
        JOIN public.orders_raw raw ON raw.id = a.raw_order_id
        WHERE a.session_id = p_session_id AND raw.booking_channel = 'walk_in'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.xendit_payment_session_orders a
        WHERE a.session_id = p_session_id
      )
    )
  ) THEN
    RETURN public.complete_xendit_session_phase1_atomic(
      p_session_id,p_event_key,p_event_type,p_payload,p_payment_session_id,
      p_payment_request_id,p_payment_id,p_amount_php,p_currency
    );
  END IF;

  INSERT INTO public.xendit_webhook_events (
    event_key,event_type,session_id,payload,processing_status
  ) VALUES (p_event_key,p_event_type,p_session_id,p_payload,'received')
  ON CONFLICT (event_key) DO NOTHING;

  IF session_row.status = 'completed' THEN
    UPDATE public.xendit_webhook_events
    SET processing_status = 'processed', processing_error = 'Duplicate completion event', processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;
  IF session_row.status = 'reconciliation_required' THEN
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected',
        processing_error = 'Session already requires finance reconciliation',
        processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;
  IF session_row.status NOT IN ('creating','active') THEN
    rejection := 'Provider completion arrived after local checkout closure';
  ELSIF p_currency IS DISTINCT FROM session_row.currency
     OR p_amount_php IS DISTINCT FROM session_row.amount_php THEN
    rejection := 'Provider amount or currency differs from frozen checkout';
  ELSIF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    rejection := 'Completed provider event has no payment id';
  ELSIF p_payment_session_id IS NULL OR btrim(p_payment_session_id) = '' THEN
    rejection := 'Completed provider event has no session id';
  ELSIF session_row.payment_session_id IS NOT NULL
        AND session_row.payment_session_id <> p_payment_session_id THEN
    rejection := 'Provider session id differs from frozen checkout';
  END IF;

  IF rejection IS NULL AND session_row.target_type = 'staff_addon' THEN
    SELECT id, status, store_id, balance_due, customer_id INTO order_row
    FROM public.orders WHERE id = session_row.order_id FOR UPDATE;
    IF NOT FOUND OR order_row.status <> 'active' OR order_row.store_id <> session_row.store_id
       OR order_row.balance_due < session_row.principal_amount_php THEN
      rejection := 'Add-on order changed before provider completion';
    ELSE
      SELECT count(*) INTO claimed_count
      FROM public.xendit_payment_session_addon_payments
      WHERE session_id = p_session_id AND released_at IS NULL;
      IF claimed_count = 0 THEN rejection := 'Add-on checkout has no live claims'; END IF;
      FOR addon_claim IN
        SELECT p.id, p.order_id, p.order_addon_id, p.amount, p.payment_type,
               p.payment_method_id,
               p.settlement_status, a.total_amount, claim.principal_amount_php
        FROM public.xendit_payment_session_addon_payments claim
        JOIN public.payments p ON p.id = claim.addon_payment_id
        LEFT JOIN public.order_addons a ON a.id = p.order_addon_id
        WHERE claim.session_id = p_session_id AND claim.released_at IS NULL
        ORDER BY p.id FOR UPDATE OF p
      LOOP
        IF addon_claim.order_id IS DISTINCT FROM session_row.order_id
           OR addon_claim.order_addon_id IS NULL
           OR addon_claim.total_amount IS NULL
           OR addon_claim.payment_type <> 'addon'
           OR addon_claim.payment_method_id <> session_row.payment_method_id
           OR addon_claim.settlement_status <> 'pending'
           OR addon_claim.amount <> addon_claim.total_amount
           OR addon_claim.amount <> addon_claim.principal_amount_php THEN
          rejection := 'Claimed add-on IOU changed before provider completion';
          EXIT;
        END IF;
        frozen_total := frozen_total + addon_claim.principal_amount_php;
        locked_count := locked_count + 1;
      END LOOP;
      IF locked_count <> claimed_count OR frozen_total <> session_row.principal_amount_php THEN
        rejection := 'Add-on IOU count or total differs from frozen checkout';
      END IF;
    END IF;
  ELSIF rejection IS NULL THEN
    SELECT a.raw_order_id, a.amount_php, raw.store_id, raw.status,
           raw.booking_channel, raw.xendit_payment_session_id,
           raw.web_quote_raw
    INTO raw_claim
    FROM public.xendit_payment_session_orders a
    JOIN public.orders_raw raw ON raw.id = a.raw_order_id
    WHERE a.session_id = p_session_id FOR UPDATE OF raw;
    IF NOT FOUND OR raw_claim.status <> 'unprocessed'
       OR raw_claim.booking_channel <> 'walk_in'
       OR raw_claim.store_id <> session_row.store_id
       OR raw_claim.xendit_payment_session_id IS DISTINCT FROM p_session_id
       OR raw_claim.amount_php <> session_row.amount_php
       OR raw_claim.web_quote_raw <> session_row.amount_php
       OR (SELECT count(*) FROM public.xendit_payment_session_orders
           WHERE session_id = p_session_id) <> 1 THEN
      rejection := 'Walk-in reservation changed before provider completion';
    END IF;
  END IF;

  IF rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions
    SET status = 'reconciliation_required', processing_error = rejection,
        last_webhook_at = now(), updated_at = now()
    WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected', processing_error = rejection, processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;

  BEGIN
    IF session_row.target_type = 'staff_addon' THEN
      payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || session_row.order_id);
      UPDATE public.payments p SET settlement_status = 'absorbed'
      FROM public.xendit_payment_session_addon_payments claim
      WHERE claim.session_id = p_session_id AND claim.released_at IS NULL
        AND claim.addon_payment_id = p.id AND p.order_id = session_row.order_id
        AND p.payment_type = 'addon' AND p.settlement_status = 'pending';
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count <> claimed_count THEN
        RAISE EXCEPTION 'Not all add-on IOUs were absorbed';
      END IF;
      INSERT INTO public.payments (
        id,store_id,order_id,payment_type,amount,payment_method_id,
        transaction_date,settlement_status,settlement_ref,customer_id
      ) VALUES (
        payment_row_id,session_row.store_id,session_row.order_id,'card_xendit',
        session_row.amount_php,session_row.payment_method_id,
        (now() AT TIME ZONE 'Asia/Manila')::date,'pending',p_payment_id,
        order_row.customer_id
      );
      UPDATE public.orders
      SET final_total = COALESCE(final_total,0) + session_row.surcharge_amount_php,
          card_fee_surcharge = COALESCE(card_fee_surcharge,0) + session_row.surcharge_amount_php,
          balance_due = balance_due - session_row.principal_amount_php,
          updated_at = now()
      WHERE id = session_row.order_id;
    ELSE
      payment_row_id := 'PAY-XENDIT-' || md5(p_payment_id || raw_claim.raw_order_id::text);
      INSERT INTO public.payments (
        id,store_id,order_id,raw_order_id,payment_type,amount,
        payment_method_id,transaction_date,settlement_status,settlement_ref
      ) VALUES (
        payment_row_id,session_row.store_id,NULL,raw_claim.raw_order_id,
        'card_xendit',session_row.amount_php,session_row.payment_method_id,
        (now() AT TIME ZONE 'Asia/Manila')::date,'pending',p_payment_id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    rejection := left('Phase 2 payment completion failed: ' || SQLERRM,1000);
  END;
  IF rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions
    SET status = 'reconciliation_required',processing_error = rejection,
        last_webhook_at = now(),updated_at = now() WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events
    SET processing_status = 'rejected',processing_error = rejection,processed_at = now()
    WHERE event_key = p_event_key AND session_id = p_session_id;
    RETURN false;
  END IF;

  UPDATE public.xendit_payment_sessions
  SET payment_session_id = COALESCE(payment_session_id,p_payment_session_id),
      payment_request_id = p_payment_request_id,payment_id = p_payment_id,
      status = 'completed',completed_at = now(),last_webhook_at = now(),
      processing_error = NULL,updated_at = now()
  WHERE id = p_session_id;
  UPDATE public.xendit_webhook_events
  SET processing_status = 'processed',processed_at = now()
  WHERE event_key = p_event_key AND session_id = p_session_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_xendit_session_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_atomic(
  uuid,text,text,jsonb,text,text,text,numeric,text
) TO service_role;

DO $verify$
BEGIN
  IF to_regclass('public.xendit_payment_session_addon_payments') IS NULL
     OR to_regprocedure('public.create_online_addons_atomic(text,text,jsonb)') IS NULL
     OR to_regprocedure('public.create_xendit_addon_session_draft(uuid,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.create_xendit_walkin_staff_session_draft(uuid,text,uuid,text,text,text,numeric)') IS NULL
     OR to_regprocedure('public.create_xendit_full_rental_session_draft(uuid,text,text,text,text,text)') IS NULL
     OR NOT has_function_privilege('service_role',
       'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)', 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_release_xendit_phase2_claims' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_xendit_live_addon_payment_claim') THEN
    RAISE EXCEPTION 'Phase 2 installation verification failed';
  END IF;
END;
$verify$;

COMMIT;
