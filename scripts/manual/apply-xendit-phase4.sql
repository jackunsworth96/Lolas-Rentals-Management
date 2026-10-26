-- Manual, forward-only Phase 4 installation. Run after apply-xendit-phase3.sql.
-- Never add this file to supabase/migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('lolas:xendit:phase4'));

DO $preflight$
BEGIN
  IF to_regclass('public.xendit_payment_sessions') IS NULL
     OR to_regclass('public.transfers') IS NULL
     OR to_regclass('public.card_settlements') IS NULL
     OR to_regclass('public.journal_entries') IS NULL
     OR to_regprocedure('public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('public.complete_xendit_session_phase2_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'Phase 4 requires the installed Phase 3 Xendit schema and transfer/accounting tables';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'xendit_payment_sessions' AND column_name = 'transfer_id' AND data_type <> 'text')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'card_settlements' AND column_name = 'transfer_id' AND data_type <> 'text') THEN
    RAISE EXCEPTION 'Phase 4 transfer_id columns have incompatible types';
  END IF;
END;
$preflight$;

ALTER TABLE public.xendit_payment_sessions ADD COLUMN IF NOT EXISTS transfer_id text REFERENCES public.transfers(id);
ALTER TABLE public.xendit_payment_sessions ADD COLUMN IF NOT EXISTS link_email_claimed_at timestamptz;
ALTER TABLE public.xendit_payment_sessions ADD COLUMN IF NOT EXISTS link_email_sent_at timestamptz;
ALTER TABLE public.xendit_payment_sessions ADD COLUMN IF NOT EXISTS link_email_last_attempt_at timestamptz;
ALTER TABLE public.xendit_payment_sessions ADD COLUMN IF NOT EXISTS link_email_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.card_settlements ADD COLUMN IF NOT EXISTS transfer_id text REFERENCES public.transfers(id);

ALTER TABLE public.xendit_payment_sessions DROP CONSTRAINT IF EXISTS xendit_payment_sessions_target_type_check;
ALTER TABLE public.xendit_payment_sessions ADD CONSTRAINT xendit_payment_sessions_target_type_check
  CHECK (target_type IN ('public_booking_group','staff_order','public_extension','staff_addon',
    'staff_rental_deposit','staff_raw_rental_deposit','staff_deposit','public_transfer'));
ALTER TABLE public.xendit_payment_sessions DROP CONSTRAINT IF EXISTS xendit_session_target_matches;
ALTER TABLE public.xendit_payment_sessions ADD CONSTRAINT xendit_session_target_matches CHECK (
  (target_type IN ('staff_order','public_extension','staff_addon','staff_rental_deposit','staff_deposit')
    AND order_id IS NOT NULL AND transfer_id IS NULL)
  OR (target_type IN ('public_booking_group','staff_raw_rental_deposit')
    AND order_id IS NULL AND transfer_id IS NULL)
  OR (target_type = 'public_transfer' AND order_id IS NULL AND transfer_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_xendit_live_transfer
  ON public.xendit_payment_sessions(transfer_id)
  WHERE transfer_id IS NOT NULL AND status IN ('creating','active','reconciliation_required');
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_settlements_transfer
  ON public.card_settlements(transfer_id) WHERE transfer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transfer_xendit_receipts (
  id text PRIMARY KEY,
  transfer_id text NOT NULL UNIQUE REFERENCES public.transfers(id),
  session_id uuid NOT NULL UNIQUE REFERENCES public.xendit_payment_sessions(id),
  provider_payment_id text NOT NULL UNIQUE,
  principal_php numeric(12,2) NOT NULL CHECK (principal_php > 0),
  surcharge_php numeric(12,2) NOT NULL CHECK (surcharge_php >= 0),
  amount_php numeric(12,2) NOT NULL CHECK (amount_php = principal_php + surcharge_php),
  store_id text NOT NULL REFERENCES public.stores(id),
  confirmation_email_sent_at timestamptz,
  confirmation_email_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.partner_booking_groups (
  group_ref text PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.accommodation_partners(id),
  store_id text NOT NULL REFERENCES public.stores(id),
  expected_count integer NOT NULL CHECK (expected_count BETWEEN 1 AND 12),
  status text NOT NULL CHECK (status IN ('creating','complete','incomplete')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_booking_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.partner_booking_groups;
CREATE POLICY "Service role full access" ON public.partner_booking_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.claim_xendit_link_email(p_session_id uuid,p_resend boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session public.xendit_payment_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.xendit_payment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'active' OR v_session.payment_link_url IS NULL
     OR v_session.expires_at IS NULL OR v_session.expires_at <= now()
     OR (v_session.link_email_sent_at IS NOT NULL AND NOT p_resend)
     OR (v_session.link_email_claimed_at IS NOT NULL AND v_session.link_email_claimed_at > now() - interval '10 minutes') THEN
    RETURN false;
  END IF;
  UPDATE public.xendit_payment_sessions SET link_email_claimed_at = now(),
    link_email_last_attempt_at = now(), link_email_attempts = link_email_attempts + 1 WHERE id = p_session_id;
  RETURN true;
END;
$$;
ALTER TABLE public.transfer_xendit_receipts ADD COLUMN IF NOT EXISTS confirmation_email_claimed_at timestamptz;
ALTER TABLE public.transfer_xendit_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.transfer_xendit_receipts;
CREATE POLICY "Service role full access" ON public.transfer_xendit_receipts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.guard_transfer_live_xendit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status, NEW.total_price, NEW.payment_status, NEW.payment_method)
       IS DISTINCT FROM (OLD.status, OLD.total_price, OLD.payment_status, OLD.payment_method)
     AND EXISTS (SELECT 1 FROM public.xendit_payment_sessions
       WHERE transfer_id = OLD.id AND status IN ('creating','active','reconciliation_required')) THEN
    RAISE EXCEPTION 'Resolve the live transfer checkout before changing its financial state';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS transfers_guard_live_xendit ON public.transfers;
CREATE TRIGGER transfers_guard_live_xendit
  BEFORE UPDATE OF status,total_price,payment_status,payment_method ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_transfer_live_xendit();

CREATE OR REPLACE FUNCTION public.create_xendit_transfer_session_draft(
  p_session_id uuid,p_reference_id text,p_transfer_id text,p_store_id text,
  p_payment_method_id text,p_principal_amount_php numeric,p_surcharge_amount_php numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transfer public.transfers%ROWTYPE;
  v_receiving text;
  v_income text;
  v_income_count integer;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.store_id <> p_store_id
     OR lower(v_transfer.status) IN ('cancelled','completed')
     OR v_transfer.payment_status <> 'Pending'
     OR v_transfer.total_price IS DISTINCT FROM p_principal_amount_php
     OR p_principal_amount_php <= 0 OR p_surcharge_amount_php < 0
     OR EXISTS (SELECT 1 FROM public.journal_entries j
       JOIN public.chart_of_accounts a ON a.id = j.account_id
       WHERE j.reference_type IN ('transfer','transfer_xendit') AND j.reference_id = p_transfer_id
         AND j.credit > 0 AND a.account_type = 'Income')
     OR EXISTS (SELECT 1 FROM public.card_settlements WHERE transfer_id = p_transfer_id)
     OR EXISTS (SELECT 1 FROM public.transfer_xendit_receipts WHERE transfer_id = p_transfer_id)
     OR EXISTS (SELECT 1 FROM public.xendit_payment_sessions WHERE transfer_id = p_transfer_id
       AND status IN ('creating','active','completed','reconciliation_required')) THEN
    RAISE EXCEPTION 'Transfer is not payable or already has a payment claim';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = p_payment_method_id
      AND is_active AND gateway_provider = 'xendit') THEN
    RAISE EXCEPTION 'Xendit payment method is unavailable';
  END IF;
  SELECT r.received_into_account_id INTO v_receiving
  FROM public.payment_routing_rules r JOIN public.chart_of_accounts a
    ON a.id = r.received_into_account_id
  WHERE r.store_id = p_store_id AND r.payment_method_id = p_payment_method_id
    AND a.is_active AND a.account_type = 'Asset' AND a.store_id IN (p_store_id,'company');
  SELECT min(a.id), count(*) INTO v_income, v_income_count FROM public.chart_of_accounts a
  WHERE a.id = 'INCOME-TRANSFER-' || p_store_id
    AND a.is_active AND a.account_type = 'Income' AND a.store_id IN (p_store_id,'company');
  IF v_receiving IS NULL OR v_income_count <> 1 THEN
    RAISE EXCEPTION 'Transfer Xendit receiving or income account is not configured';
  END IF;
  INSERT INTO public.xendit_payment_sessions(id,reference_id,target_type,transfer_id,store_id,
    payment_method_id,principal_amount_php,surcharge_amount_php,amount_php,status)
  VALUES(p_session_id,p_reference_id,'public_transfer',p_transfer_id,p_store_id,
    p_payment_method_id,p_principal_amount_php,p_surcharge_amount_php,
    p_principal_amount_php + p_surcharge_amount_php,'creating');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_transfer_manual_payment_atomic(
  p_transfer_id text,p_store_id text,p_method_id text,p_amount numeric,p_date date,
  p_receiving_id text,p_income_id text,p_mark_collected boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transfer public.transfers%ROWTYPE;
  v_paid numeric(12,2);
  v_receiving text;
  v_transaction text := gen_random_uuid()::text;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.store_id <> p_store_id OR lower(v_transfer.status) IN ('cancelled','completed')
     OR (p_mark_collected AND v_transfer.collected_at IS NOT NULL)
     OR v_transfer.payment_status = 'Paid' OR p_amount <= 0
     OR EXISTS (SELECT 1 FROM public.xendit_payment_sessions WHERE transfer_id = p_transfer_id
       AND status IN ('creating','active','completed','reconciliation_required'))
     OR EXISTS (SELECT 1 FROM public.card_settlements WHERE transfer_id = p_transfer_id)
     OR EXISTS (SELECT 1 FROM public.journal_entries WHERE reference_id = p_transfer_id
       AND reference_type = 'transfer_xendit') THEN
    RAISE EXCEPTION 'Transfer payment is unavailable or a checkout is in progress';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = p_method_id
      AND is_active AND gateway_provider IS NULL AND name NOT ILIKE '%card%') THEN
    RAISE EXCEPTION 'Select an active manual non-card payment method';
  END IF;
  SELECT r.received_into_account_id INTO v_receiving FROM public.payment_routing_rules r
    WHERE r.store_id = p_store_id AND r.payment_method_id = p_method_id;
  v_receiving := COALESCE(v_receiving,p_receiving_id);
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = v_receiving
      AND is_active AND account_type = 'Asset' AND store_id IN (p_store_id,'company'))
     OR NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = p_income_id
      AND is_active AND account_type = 'Income' AND store_id IN (p_store_id,'company')) THEN
    RAISE EXCEPTION 'Transfer payment account routing is unavailable';
  END IF;
  SELECT COALESCE(sum(j.credit),0) INTO v_paid FROM public.journal_entries j
    JOIN public.chart_of_accounts a ON a.id = j.account_id
    WHERE j.reference_type = 'transfer' AND j.reference_id = p_transfer_id
      AND j.credit > 0 AND a.account_type = 'Income';
  IF v_paid + p_amount > v_transfer.total_price THEN
    RAISE EXCEPTION 'Transfer payment exceeds the remaining balance';
  END IF;
  INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,
    debit,credit,description,reference_type,reference_id,created_by)
  VALUES
    (gen_random_uuid()::text,v_transaction,to_char(p_date,'YYYY-MM'),p_date,p_store_id,
      v_receiving,p_amount,0,'Transfer customer payment','transfer',p_transfer_id,NULL),
    (gen_random_uuid()::text,v_transaction,to_char(p_date,'YYYY-MM'),p_date,p_store_id,
      p_income_id,0,p_amount,'Transfer income','transfer',p_transfer_id,NULL);
  UPDATE public.transfers SET payment_method = p_method_id,
    payment_status = CASE WHEN v_paid + p_amount = total_price THEN 'Paid' ELSE 'Partially Paid' END,
    collected_at = CASE WHEN p_mark_collected THEN now() ELSE collected_at END,
    collected_amount = CASE WHEN p_mark_collected THEN COALESCE(collected_amount,0) + p_amount ELSE collected_amount END,
    updated_at = now() WHERE id = p_transfer_id;
END;
$$;

DO $rename$
BEGIN
  IF to_regprocedure('public.complete_xendit_session_phase3_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text) RENAME TO complete_xendit_session_phase3_atomic';
  END IF;
END;
$rename$;

CREATE OR REPLACE FUNCTION public.complete_xendit_session_atomic(
  p_session_id uuid,p_event_key text,p_event_type text,p_payload jsonb,
  p_payment_session_id text,p_payment_request_id text,p_payment_id text,
  p_amount_php numeric,p_currency text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transfer_id text;
  v_transfer public.transfers%ROWTYPE;
  v_session public.xendit_payment_sessions%ROWTYPE;
  v_rejection text;
  v_receiving text;
  v_income text;
  v_income_count integer;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_receipt_id text;
  v_id_type text;
BEGIN
  SELECT transfer_id INTO v_transfer_id FROM public.xendit_payment_sessions WHERE id = p_session_id;
  IF v_transfer_id IS NULL THEN
    RETURN public.complete_xendit_session_phase3_atomic(p_session_id,p_event_key,p_event_type,
      p_payload,p_payment_session_id,p_payment_request_id,p_payment_id,p_amount_php,p_currency);
  END IF;
  SELECT * INTO v_transfer FROM public.transfers WHERE id = v_transfer_id FOR UPDATE;
  SELECT * INTO v_session FROM public.xendit_payment_sessions WHERE id = p_session_id FOR UPDATE;
  INSERT INTO public.xendit_webhook_events(event_key,event_type,session_id,payload,processing_status)
  VALUES(p_event_key,p_event_type,p_session_id,p_payload,'received') ON CONFLICT(event_key) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.xendit_webhook_events WHERE event_key = p_event_key
      AND event_type = p_event_type AND session_id = p_session_id AND payload = p_payload) THEN
    RAISE EXCEPTION 'Webhook event key belongs to another session';
  END IF;
  IF v_session.status = 'completed' THEN
    UPDATE public.xendit_webhook_events SET processing_status = 'processed',processed_at = now()
      WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  IF v_session.status = 'reconciliation_required' THEN
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = 'Session already requires finance reconciliation',processed_at = now()
      WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  IF v_session.target_type <> 'public_transfer' OR v_session.status NOT IN ('creating','active')
     OR v_session.payment_session_id IS DISTINCT FROM p_payment_session_id
     OR p_payment_session_id IS NULL OR btrim(p_payment_session_id) = ''
     OR p_payment_id IS NULL OR btrim(p_payment_id) = ''
     OR p_payment_request_id IS NULL OR btrim(p_payment_request_id) = ''
     OR p_currency IS DISTINCT FROM 'PHP' OR p_amount_php IS DISTINCT FROM v_session.amount_php
     OR v_transfer.id IS NULL OR v_transfer.store_id <> v_session.store_id
     OR v_transfer.payment_status <> 'Pending' OR lower(v_transfer.status) IN ('cancelled','completed')
     OR v_transfer.total_price IS DISTINCT FROM v_session.principal_amount_php
     OR EXISTS (SELECT 1 FROM public.journal_entries j
       JOIN public.chart_of_accounts a ON a.id = j.account_id
       WHERE j.reference_type IN ('transfer','transfer_xendit') AND j.reference_id = v_transfer_id
         AND j.credit > 0 AND a.account_type = 'Income')
     OR EXISTS (SELECT 1 FROM public.card_settlements WHERE transfer_id = v_transfer_id)
     OR EXISTS (SELECT 1 FROM public.transfer_xendit_receipts WHERE transfer_id = v_transfer_id) THEN
    v_rejection := 'Transfer or provider payment differs from frozen checkout';
  END IF;
  SELECT r.received_into_account_id INTO v_receiving FROM public.payment_routing_rules r
    JOIN public.chart_of_accounts a ON a.id = r.received_into_account_id
    WHERE r.store_id = v_session.store_id AND r.payment_method_id = v_session.payment_method_id
      AND a.is_active AND a.account_type = 'Asset' AND a.store_id IN (v_session.store_id,'company');
  SELECT min(a.id), count(*) INTO v_income, v_income_count FROM public.chart_of_accounts a
    WHERE a.id = 'INCOME-TRANSFER-' || v_session.store_id
      AND a.is_active AND a.account_type = 'Income' AND a.store_id IN (v_session.store_id,'company');
  IF v_receiving IS NULL OR v_income_count <> 1 THEN
    v_rejection := 'Transfer Xendit accounting route changed';
  END IF;
  IF v_rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions SET status = 'reconciliation_required',
      processing_error = v_rejection,last_webhook_at = now(),updated_at = now() WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_rejection,processed_at = now() WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  BEGIN
    v_receipt_id := 'TRF-XENDIT-' || md5(p_payment_id || p_session_id::text);
    INSERT INTO public.transfer_xendit_receipts(id,transfer_id,session_id,provider_payment_id,
      principal_php,surcharge_php,amount_php,store_id)
    VALUES(v_receipt_id,v_transfer_id,p_session_id,p_payment_id,v_session.principal_amount_php,
      v_session.surcharge_amount_php,v_session.amount_php,v_session.store_id);
    INSERT INTO public.journal_entries(id,transaction_id,period,date,store_id,account_id,
      debit,credit,description,reference_type,reference_id,created_by)
    VALUES
      (gen_random_uuid()::text,p_session_id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_session.store_id,v_receiving,v_session.amount_php,0,'Xendit transfer payment',
        'transfer_xendit',v_transfer_id,NULL),
      (gen_random_uuid()::text,p_session_id::text,to_char(v_date,'YYYY-MM'),v_date,
        v_session.store_id,v_income,0,v_session.amount_php,'Transfer income including card surcharge',
        'transfer_xendit',v_transfer_id,NULL);
    SELECT data_type INTO v_id_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'card_settlements' AND column_name = 'id';
    IF v_id_type = 'text' THEN
      INSERT INTO public.card_settlements(id,store_id,transfer_id,name,amount,ref_number,raw_date,is_paid)
      VALUES('CS-TRANSFER-' || md5(v_transfer_id),v_session.store_id,v_transfer_id,
        v_transfer.customer_name,v_session.amount_php,p_payment_id,v_date::text,false);
    ELSE
      INSERT INTO public.card_settlements(store_id,transfer_id,name,amount,ref_number,raw_date,is_paid)
      VALUES(v_session.store_id,v_transfer_id,v_transfer.customer_name,v_session.amount_php,
        p_payment_id,v_date::text,false);
    END IF;
    UPDATE public.xendit_payment_sessions SET payment_request_id = p_payment_request_id,
      payment_id = p_payment_id,status = 'completed',completed_at = now(),last_webhook_at = now(),
      processing_error = NULL,updated_at = now() WHERE id = p_session_id;
    UPDATE public.transfers SET total_price = v_session.amount_php,payment_method = v_session.payment_method_id,
      payment_status = 'Paid',collected_at = now(),collected_amount = v_session.amount_php,
      updated_at = now() WHERE id = v_transfer_id;
  EXCEPTION WHEN OTHERS THEN
    v_rejection := left('Transfer payment completion failed: ' || SQLERRM,1000);
  END;
  IF v_rejection IS NOT NULL THEN
    UPDATE public.xendit_payment_sessions SET status = 'reconciliation_required',
      processing_error = v_rejection,last_webhook_at = now(),updated_at = now() WHERE id = p_session_id;
    UPDATE public.xendit_webhook_events SET processing_status = 'rejected',
      processing_error = v_rejection,processed_at = now() WHERE event_key = p_event_key;
    RETURN false;
  END IF;
  UPDATE public.xendit_webhook_events SET processing_status = 'processed',processed_at = now()
    WHERE event_key = p_event_key;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_xendit_transfer_session_draft(uuid,text,text,text,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_xendit_transfer_session_draft(uuid,text,text,text,text,numeric,numeric) TO service_role;
REVOKE ALL ON FUNCTION public.claim_xendit_link_email(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_xendit_link_email(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.record_transfer_manual_payment_atomic(text,text,text,numeric,date,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_transfer_manual_payment_atomic(text,text,text,numeric,date,text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_xendit_session_phase3_atomic(uuid,text,text,jsonb,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;

DO $verify$
BEGIN
  IF to_regprocedure('public.complete_xendit_session_phase3_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)') IS NULL
     OR to_regprocedure('public.create_xendit_transfer_session_draft(uuid,text,text,text,text,numeric,numeric)') IS NULL
     OR to_regprocedure('public.record_transfer_manual_payment_atomic(text,text,text,numeric,date,text,text,boolean)') IS NULL
     OR NOT has_function_privilege('service_role',
       'public.complete_xendit_session_atomic(uuid,text,text,jsonb,text,text,text,numeric,text)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.create_xendit_transfer_session_draft(uuid,text,text,text,text,numeric,numeric)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.claim_xendit_link_email(uuid,boolean)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.record_transfer_manual_payment_atomic(text,text,text,numeric,date,text,text,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Phase 4 function contract or service-role privilege verification failed';
  END IF;
END;
$verify$;
COMMIT;

SELECT id, status, transfer_id FROM public.xendit_payment_sessions
WHERE transfer_id IS NOT NULL ORDER BY created_at DESC LIMIT 20;
SELECT id, transfer_id, amount_php, confirmation_email_sent_at FROM public.transfer_xendit_receipts
ORDER BY created_at DESC LIMIT 20;
