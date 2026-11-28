-- Apply after Phase 4 and the deposit settlement guard. Do not enable live keys.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('xendit-deposit-holds'));

DO $$
BEGIN
  IF to_regprocedure('public.resolve_xendit_deposit_accounts(text)') IS NULL
     OR to_regprocedure('public.guard_order_deposit_payment_mutation()') IS NULL
     OR to_regprocedure('public.settle_order_checked_atomic(text,text,timestamptz,numeric,jsonb,jsonb,jsonb,text,text,date,jsonb,jsonb,numeric,numeric,text,jsonb,jsonb)') IS NULL
     OR to_regclass('public.xendit_payment_session_deposits') IS NULL
     OR to_regclass('public.xendit_refund_requests') IS NULL
     OR to_regclass('public.xendit_payment_sessions') IS NULL THEN
    RAISE EXCEPTION 'Deposit holds require the Phase 3 deposit accounting and settlement guard';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.xendit_deposit_holds (
  id uuid PRIMARY KEY,
  reference_id text NOT NULL UNIQUE CHECK (reference_id ~ '^XH[0-9a-f]{32}$'),
  order_id text NOT NULL REFERENCES public.orders(id),
  store_id text NOT NULL REFERENCES public.stores(id),
  amount_php numeric(12,2) NOT NULL CHECK (amount_php > 0),
  receiving_account_id text NOT NULL REFERENCES public.chart_of_accounts(id),
  liability_account_id text NOT NULL REFERENCES public.chart_of_accounts(id),
  created_by text NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'creating' CHECK (status IN (
    'creating','awaiting_authorization','authorized','capture_pending','release_pending',
    'captured','released','expired','failed','reconciliation_required')),
  provider_session_id text UNIQUE,
  provider_payment_id text UNIQUE,
  provider_request_id text UNIQUE,
  provider_capture_id text UNIQUE,
  checkout_url text,
  checkout_expires_at timestamptz,
  authorization_expires_at timestamptz,
  captured_php numeric(12,2),
  processing_error text
);
ALTER TABLE public.xendit_deposit_holds
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_by text REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS recovery_evidence jsonb,
  ADD COLUMN IF NOT EXISTS release_step text CHECK (release_step IN ('session','session_rejected','payment'));
CREATE INDEX IF NOT EXISTS xendit_deposit_holds_order ON public.xendit_deposit_holds(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.xendit_deposit_hold_actions (
  hold_id uuid PRIMARY KEY REFERENCES public.xendit_deposit_holds(id),
  kind text NOT NULL CHECK (kind IN ('capture','release')),
  amount_php numeric(12,2),
  reason text,
  employee_id text NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'capture' AND amount_php IS NOT NULL AND amount_php > 0
          AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500)
    OR (kind = 'release' AND amount_php IS NULL))
);

ALTER TABLE public.xendit_deposit_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xendit_deposit_hold_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xendit_deposit_holds, public.xendit_deposit_hold_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.xendit_deposit_holds, public.xendit_deposit_hold_actions TO service_role;

CREATE OR REPLACE FUNCTION public.xendit_deposit_hold_blocked(p_order_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.xendit_deposit_holds
    WHERE order_id = p_order_id AND status NOT IN ('captured','released','expired','failed'));
$$;

CREATE OR REPLACE FUNCTION public.guard_xendit_deposit_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_id text;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.security_deposit IS NOT DISTINCT FROM OLD.security_deposit
       AND NEW.store_id IS NOT DISTINCT FROM OLD.store_id THEN RETURN NEW; END IF;
    v_order_id := OLD.id;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    IF NEW.payment_type NOT IN ('deposit','security_deposit','deposit_refund','deposit_applied')
       OR NEW.order_id IS NULL THEN RETURN NEW; END IF;
    v_order_id := NEW.order_id;
  ELSIF TG_TABLE_NAME = 'xendit_refund_requests' THEN
    PERFORM 1 FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
    IF public.xendit_deposit_hold_blocked(NEW.order_id) THEN
      RAISE EXCEPTION 'Resolve the Xendit deposit hold before requesting a deposit refund';
    END IF;
    RETURN NEW;
  ELSE
    IF NEW.target_type NOT IN ('staff_deposit','staff_rental_deposit')
       OR NEW.status NOT IN ('creating','active','reconciliation_required')
       OR NEW.order_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.order_id IS NOT DISTINCT FROM OLD.order_id
         AND NEW.target_type = OLD.target_type
         AND OLD.status IN ('creating','active','reconciliation_required') THEN RETURN NEW; END IF;
    END IF;
    v_order_id := NEW.order_id;
  END IF;
  IF TG_TABLE_NAME <> 'orders' THEN
    PERFORM 1 FROM public.orders WHERE id = v_order_id FOR UPDATE;
  END IF;
  IF public.xendit_deposit_hold_blocked(v_order_id) THEN
    RAISE EXCEPTION 'Resolve the Xendit deposit hold before collecting a deposit or closing this order';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_xendit_deposit_hold ON public.orders;
CREATE TRIGGER guard_xendit_deposit_hold BEFORE UPDATE OF status,security_deposit,store_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_xendit_deposit_hold();
DROP TRIGGER IF EXISTS guard_xendit_deposit_hold ON public.payments;
CREATE TRIGGER guard_xendit_deposit_hold BEFORE INSERT OR UPDATE OF order_id,payment_type,amount ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_xendit_deposit_hold();
DROP TRIGGER IF EXISTS guard_xendit_deposit_hold ON public.xendit_payment_sessions;
CREATE TRIGGER guard_xendit_deposit_hold BEFORE INSERT OR UPDATE OF target_type,status,order_id ON public.xendit_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_xendit_deposit_hold();
DROP TRIGGER IF EXISTS guard_xendit_deposit_hold ON public.xendit_refund_requests;
CREATE TRIGGER guard_xendit_deposit_hold BEFORE INSERT ON public.xendit_refund_requests
FOR EACH ROW WHEN (NEW.kind = 'deposit') EXECUTE FUNCTION public.guard_xendit_deposit_hold();

CREATE OR REPLACE FUNCTION public.create_xendit_deposit_hold(
  p_id uuid, p_order_id text, p_store_id text, p_employee_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_hold public.xendit_deposit_holds%ROWTYPE;
  v_due numeric;
  v_receiving text;
  v_liability text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status IS DISTINCT FROM 'active' OR v_order.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'Deposit holds require an active order in this store';
  END IF;
  IF public.xendit_deposit_hold_blocked(p_order_id) OR EXISTS (
    SELECT 1 FROM public.xendit_payment_sessions
    WHERE order_id = p_order_id AND target_type IN ('staff_deposit','staff_rental_deposit')
      AND status IN ('creating','active','reconciliation_required')
  ) THEN RAISE EXCEPTION 'Another deposit checkout or hold must be resolved first'; END IF;
  IF EXISTS (SELECT 1 FROM public.xendit_refund_requests
      WHERE order_id = p_order_id AND kind = 'deposit'
        AND status IN ('reserved','pending','reconciliation_required')) THEN
    RAISE EXCEPTION 'Resolve the Xendit deposit refund before creating a card hold';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = 'xendit' AND is_active AND gateway_provider = 'xendit') THEN
    RAISE EXCEPTION 'Xendit payment method is unavailable';
  END IF;
  SELECT v_order.security_deposit - COALESCE(sum(amount) FILTER (
      WHERE payment_type IN ('deposit','security_deposit')),0) INTO v_due
    FROM public.payments WHERE order_id = p_order_id;
  IF v_due IS NULL OR v_due <= 0 OR v_due <> round(v_due,2) OR EXISTS (
      SELECT 1 FROM public.payments WHERE order_id = p_order_id AND payment_type = 'deposit_refund'
  ) THEN RAISE EXCEPTION 'No eligible deposit balance'; END IF;
  SELECT receiving_id, liability_id INTO STRICT v_receiving, v_liability
    FROM public.resolve_xendit_deposit_accounts(p_store_id);
  INSERT INTO public.xendit_deposit_holds(id,reference_id,order_id,store_id,amount_php,
    receiving_account_id,liability_account_id,created_by)
  VALUES(p_id,'XH' || replace(p_id::text,'-',''),p_order_id,p_store_id,v_due,
    v_receiving,v_liability,p_employee_id) RETURNING * INTO v_hold;
  RETURN to_jsonb(v_hold);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_xendit_deposit_hold_action(
  p_id uuid, p_order_id text, p_store_id text, p_employee_id text,
  p_kind text, p_amount numeric, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hold public.xendit_deposit_holds%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.orders WHERE id = p_order_id AND store_id = p_store_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active order not found'; END IF;
  SELECT * INTO v_hold FROM public.xendit_deposit_holds WHERE id = p_id AND order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit hold not found'; END IF;
  IF p_kind = 'capture' THEN
    IF v_hold.status <> 'authorized' OR v_hold.provider_payment_id IS NULL OR p_amount IS NULL
       OR p_amount <= 0 OR p_amount > v_hold.amount_php OR p_amount <> round(p_amount,2)
       OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500
       OR (v_hold.authorization_expires_at IS NOT NULL AND v_hold.authorization_expires_at <= now()) THEN
      RAISE EXCEPTION 'Hold is not eligible for this capture';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.resolve_xendit_deposit_accounts(p_store_id) a
      WHERE a.receiving_id = v_hold.receiving_account_id AND a.liability_id = v_hold.liability_account_id
    ) THEN RAISE EXCEPTION 'Deposit accounts changed after authorization'; END IF;
  ELSIF p_kind = 'release' THEN
    IF v_hold.status NOT IN ('awaiting_authorization','authorized') OR v_hold.provider_session_id IS NULL THEN
      RAISE EXCEPTION 'Hold is not eligible for release';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid hold action';
  END IF;
  INSERT INTO public.xendit_deposit_hold_actions(hold_id,kind,amount_php,reason,employee_id)
    VALUES(p_id,p_kind,p_amount,p_reason,p_employee_id);
  UPDATE public.xendit_deposit_holds SET status = p_kind || '_pending', processing_error = NULL,
    release_step = CASE WHEN p_kind = 'release' THEN
      CASE WHEN v_hold.provider_payment_id IS NULL THEN 'session' ELSE 'payment' END END
    WHERE id = p_id RETURNING * INTO v_hold;
  RETURN to_jsonb(v_hold);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_xendit_deposit_hold_release_void(
  p_id uuid, p_order_id text, p_store_id text, p_payment_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.orders WHERE id = p_order_id AND store_id = p_store_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR p_payment_id IS NULL THEN RETURN false; END IF;
  UPDATE public.xendit_deposit_holds SET release_step = 'payment', status = 'release_pending', processing_error = NULL
    WHERE id = p_id AND order_id = p_order_id AND store_id = p_store_id
      AND status IN ('release_pending','reconciliation_required') AND release_step = 'session_rejected'
      AND provider_payment_id = p_payment_id AND provider_request_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.xendit_deposit_hold_actions WHERE hold_id = p_id AND kind = 'release');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_xendit_deposit_hold(
  p_id uuid, p_order_id text, p_store_id text, p_employee_id text,
  p_session_id text, p_support_case_id text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.xendit_deposit_holds%ROWTYPE;
BEGIN
  IF p_employee_id IS NULL THEN RAISE EXCEPTION 'Recovery requires an administrator employee ID'; END IF;
  PERFORM 1 FROM public.orders WHERE id = p_order_id AND store_id = p_store_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active order not found'; END IF;
  SELECT * INTO h FROM public.xendit_deposit_holds WHERE id = p_id AND order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR h.store_id IS DISTINCT FROM p_store_id OR NOT (h.status = 'reconciliation_required'
       OR (h.status = 'creating' AND h.created_at <= now() - interval '2 minutes'))
     OR h.recovered_at IS NOT NULL OR h.provider_session_id IS NOT NULL OR h.provider_request_id IS NOT NULL
     OR h.provider_payment_id IS NOT NULL OR h.provider_capture_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.xendit_deposit_hold_actions WHERE hold_id = p_id) THEN
    RAISE EXCEPTION 'Hold is no longer eligible for missing checkout recovery';
  END IF;
  IF p_session_id IS NOT NULL THEN
    IF p_session_id !~ '^ps-[A-Za-z0-9]{1,125}$' OR p_support_case_id IS NOT NULL OR p_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid verified session recovery';
    END IF;
  ELSIF p_support_case_id IS NULL OR length(btrim(p_support_case_id)) NOT BETWEEN 1 AND 100
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Xendit support case and confirmation reason are required';
  END IF;

  UPDATE public.xendit_deposit_holds SET
    provider_session_id = p_session_id,
    status = CASE WHEN p_session_id IS NULL THEN 'failed' ELSE status END,
    processing_error = CASE WHEN p_session_id IS NULL THEN NULL ELSE processing_error END,
    checkout_url = NULL,
    recovered_at = now(), recovered_by = p_employee_id,
    recovery_evidence = CASE WHEN p_session_id IS NOT NULL
      THEN jsonb_build_object('type','verified_session','sessionId',p_session_id)
      ELSE jsonb_build_object('type','support_confirmed_no_session','supportCaseId',btrim(p_support_case_id),
        'reason',btrim(p_reason)) END
  WHERE id = h.id RETURNING * INTO h;
  RETURN to_jsonb(h);
END;
$$;

-- Provider observations are normalized and verified by the API. Always acquire
-- the order lock before the hold lock; receipt and journal writes share this transaction.
CREATE OR REPLACE FUNCTION public.observe_xendit_deposit_hold(p_id uuid, p_observation jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h public.xendit_deposit_holds%ROWTYPE;
  o public.orders%ROWTYPE;
  a public.xendit_deposit_hold_actions%ROWTYPE;
  v_state text := p_observation->>'state';
  v_session text := p_observation->>'sessionId';
  v_payment text := p_observation->>'paymentId';
  v_request text := p_observation->>'requestId';
  v_capture text := p_observation->>'captureId';
  v_amount numeric := (p_observation->>'capturedPHP')::numeric;
  v_receipt text := 'PAY-XENDIT-HOLD-' || replace(p_id::text,'-','');
  v_date date := timezone('Asia/Manila',(p_observation->>'capturedAt')::timestamptz)::date;
BEGIN
  SELECT ord.* INTO STRICT o FROM public.orders ord
    JOIN public.xendit_deposit_holds hold ON hold.order_id = ord.id
    WHERE hold.id = p_id FOR UPDATE OF ord;
  SELECT * INTO STRICT h FROM public.xendit_deposit_holds WHERE id = p_id FOR UPDATE;
  SELECT * INTO a FROM public.xendit_deposit_hold_actions WHERE hold_id = p_id;
  BEGIN
    IF v_state = 'creation_rejected' THEN
      IF h.status = 'creating' AND h.provider_session_id IS NULL THEN
        UPDATE public.xendit_deposit_holds SET status = 'failed',
          processing_error = 'Xendit rejected checkout validation' WHERE id = h.id;
      END IF;
      RETURN;
    END IF;
    IF v_state = 'uncertain' THEN
      -- A timeout cannot undo a concurrent confirmed result.
      IF h.status = p_observation->>'expectedStatus' THEN
        UPDATE public.xendit_deposit_holds SET status = 'reconciliation_required',
          provider_session_id = COALESCE(provider_session_id,v_session),
          processing_error = 'Xendit did not confirm the result' WHERE id = h.id;
      END IF;
      RETURN;
    END IF;
    IF v_state = 'conflict' OR v_session IS NULL
       OR (h.provider_session_id IS NOT NULL AND h.provider_session_id <> v_session)
       OR (v_payment IS NOT NULL AND h.provider_payment_id IS NOT NULL AND h.provider_payment_id <> v_payment)
       OR (v_request IS NOT NULL AND h.provider_request_id IS NOT NULL AND h.provider_request_id <> v_request) THEN
      RAISE EXCEPTION 'Xendit identity or outcome did not match the hold';
    END IF;
    IF v_state = 'session_cancel_rejected' THEN
      UPDATE public.xendit_deposit_holds SET release_step = 'session_rejected'
        WHERE id = h.id AND provider_session_id = v_session AND a.kind = 'release'
          AND release_step = 'session' AND status IN ('release_pending','reconciliation_required');
      RETURN;
    END IF;
    IF v_state = 'captured' AND h.provider_capture_id IS NOT NULL THEN
      IF h.provider_session_id IS DISTINCT FROM v_session OR v_payment IS NULL OR v_request IS NULL
         OR h.provider_payment_id IS DISTINCT FROM v_payment OR h.provider_request_id IS DISTINCT FROM v_request
         OR h.provider_capture_id IS DISTINCT FROM v_capture OR h.captured_php IS DISTINCT FROM v_amount THEN
        RAISE EXCEPTION 'Xendit reported a different capture';
      END IF;
      UPDATE public.xendit_deposit_holds SET status = 'captured', processing_error = NULL, checkout_url = NULL
        WHERE id = h.id AND status = 'reconciliation_required';
      RETURN;
    END IF;
    IF v_state = 'session_identified' THEN
      IF h.provider_session_id IS NULL THEN
        UPDATE public.xendit_deposit_holds SET provider_session_id = v_session,
          status = CASE WHEN h.status = 'failed' THEN 'reconciliation_required' ELSE h.status END,
          processing_error = CASE WHEN h.status = 'failed' THEN 'Xendit session appeared after closure' ELSE h.processing_error END
          WHERE id = h.id;
      END IF;
      RETURN;
    END IF;
    IF h.status IN ('captured','released','expired','failed') THEN
      IF h.status = 'failed' THEN RAISE EXCEPTION 'Provider session appeared after rejected checkout'; END IF;
      IF v_state IN ('awaiting_authorization','pending','authorized') OR h.status = v_state THEN RETURN; END IF;
      RAISE EXCEPTION 'Xendit reported conflicting terminal outcomes';
    END IF;
    IF v_state = 'pending' THEN
      UPDATE public.xendit_deposit_holds SET provider_session_id = v_session,
        provider_payment_id = COALESCE(v_payment,h.provider_payment_id),
        provider_request_id = COALESCE(v_request,h.provider_request_id), checkout_url = NULL
      WHERE id = h.id;
      RETURN;
    END IF;
    IF v_state IN ('awaiting_authorization','authorized','released','expired') THEN
      IF v_state = 'awaiting_authorization' AND
         (h.status NOT IN ('creating','awaiting_authorization','reconciliation_required')
          OR a.kind IS NOT NULL OR h.provider_payment_id IS NOT NULL
          OR h.recovery_evidence->>'type' = 'support_confirmed_no_session') THEN RETURN; END IF;
      IF v_state IN ('released','expired') AND h.provider_payment_id IS NOT NULL AND v_payment IS NULL THEN
        RAISE EXCEPTION 'Checkout closure does not prove an authorization was released';
      END IF;
      IF v_state = 'authorized' AND (v_payment IS NULL OR v_request IS NULL) THEN
        RAISE EXCEPTION 'Authorization identifiers are missing';
      END IF;
      UPDATE public.xendit_deposit_holds SET
        status = CASE WHEN v_state = 'authorized' AND a.kind IS NOT NULL THEN h.status ELSE v_state END,
        provider_session_id = v_session, provider_payment_id = COALESCE(v_payment,h.provider_payment_id),
        provider_request_id = COALESCE(v_request,h.provider_request_id),
        checkout_url = CASE WHEN v_state = 'awaiting_authorization' THEN p_observation->>'checkoutUrl' END,
        checkout_expires_at = COALESCE((p_observation->>'checkoutExpiresAt')::timestamptz,h.checkout_expires_at),
        processing_error = CASE WHEN v_state = 'authorized' AND a.kind IS NOT NULL THEN h.processing_error END
      WHERE id = h.id;
      RETURN;
    END IF;
    IF v_state IS DISTINCT FROM 'captured' OR a.kind IS DISTINCT FROM 'capture'
       OR v_capture IS NULL OR v_payment IS NULL OR v_request IS NULL OR v_date IS NULL
       OR v_amount IS DISTINCT FROM a.amount_php OR v_amount <= 0 OR v_amount > h.amount_php
       OR o.status IS DISTINCT FROM 'active' OR o.store_id IS DISTINCT FROM h.store_id
       OR o.security_deposit IS NULL OR o.security_deposit < v_amount + COALESCE((
         SELECT sum(amount) FROM public.payments WHERE order_id = o.id AND payment_type IN ('deposit','security_deposit')
       ),0)
       OR NOT EXISTS (SELECT 1 FROM public.resolve_xendit_deposit_accounts(h.store_id) ac
         WHERE ac.receiving_id = h.receiving_account_id AND ac.liability_id = h.liability_account_id) THEN
      RAISE EXCEPTION 'Xendit capture did not match the reserved action, order, or accounts';
    END IF;

    UPDATE public.xendit_deposit_holds SET status = 'captured', captured_php = v_amount,
      provider_session_id = v_session, provider_payment_id = v_payment, provider_request_id = v_request,
      provider_capture_id = v_capture, checkout_url = NULL, processing_error = NULL WHERE id = h.id;
    -- Only a verified capture enters the existing settlement/refund records.
    INSERT INTO public.xendit_payment_sessions(id,reference_id,payment_session_id,payment_request_id,payment_id,
      target_type,order_id,store_id,payment_method_id,principal_amount_php,amount_php,status,created_by,completed_at)
    VALUES(h.id,h.reference_id,v_session,v_request,v_payment,'staff_deposit',o.id,h.store_id,'xendit',
      v_amount,v_amount,'completed',h.created_by,now());
    INSERT INTO public.xendit_payment_session_deposits(session_id,order_id,rental_principal_php,
      rental_surcharge_php,deposit_php,receiving_account_id,liability_account_id)
    VALUES(h.id,o.id,0,0,v_amount,h.receiving_account_id,h.liability_account_id);
    INSERT INTO public.payments(id,store_id,order_id,payment_type,amount,payment_method_id,transaction_date,
      settlement_status,settlement_ref,customer_id,account_id)
    VALUES(v_receipt,h.store_id,o.id,'deposit',v_amount,'xendit',v_date,'pending',v_payment,
      o.customer_id,h.receiving_account_id);
    INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,debit,credit,
      description,reference_type,reference_id,created_by)
    VALUES
      (gen_random_uuid()::text,h.id::text,to_char(v_date,'YYYY-MM'),v_date,h.store_id,h.receiving_account_id,
        v_amount,0,'Xendit deposit hold captured','payment',v_receipt,a.employee_id),
      (gen_random_uuid()::text,h.id::text,to_char(v_date,'YYYY-MM'),v_date,h.store_id,h.liability_account_id,
        0,v_amount,'Xendit refundable deposit held','payment',v_receipt,a.employee_id);
    UPDATE public.orders SET deposit_method_id = 'xendit', updated_at = now(),
      deposit_status = CASE WHEN security_deposit = (SELECT sum(amount) FROM public.payments
        WHERE order_id = o.id AND payment_type IN ('deposit','security_deposit')) THEN 'paid' ELSE deposit_status END
      WHERE id = o.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.xendit_deposit_holds SET status = 'reconciliation_required',
      processing_error = left(SQLERRM,1000), checkout_url = NULL
      WHERE id = h.id;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.xendit_deposit_hold_blocked(text), public.guard_xendit_deposit_hold(),
  public.create_xendit_deposit_hold(uuid,text,text,text),
  public.reserve_xendit_deposit_hold_action(uuid,text,text,text,text,numeric,text),
  public.reserve_xendit_deposit_hold_release_void(uuid,text,text,text),
  public.recover_xendit_deposit_hold(uuid,text,text,text,text,text,text),
  public.observe_xendit_deposit_hold(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_xendit_deposit_hold(uuid,text,text,text),
  public.reserve_xendit_deposit_hold_action(uuid,text,text,text,text,numeric,text),
  public.reserve_xendit_deposit_hold_release_void(uuid,text,text,text),
  public.recover_xendit_deposit_hold(uuid,text,text,text,text,text,text),
  public.observe_xendit_deposit_hold(uuid,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
