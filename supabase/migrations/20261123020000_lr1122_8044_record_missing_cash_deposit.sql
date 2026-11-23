-- LR-1122-8044 was activated with a ₱1,000 cash deposit but no deposit method,
-- so no deposit payment was recorded. The 22 Nov cash-up balanced the envelope
-- with a reconciliation adjustment (credit RECON-ADJ-EQUITY). Record the
-- deposit at activation time so settlement refunds it from the envelope, and
-- move the adjustment into the deposits-held liability.
DO $$
DECLARE
  v_order_id constant text := '54654a01-e6e4-5fdf-b3f5-a3342d0fedd8';
  v_payment_id constant text := 'b1e2c3d4-1122-4804-8044-000000000001';
  v_tx_id constant text := 'b1e2c3d4-1122-4804-8044-000000000002';
  v_at constant timestamptz := '2026-11-22T02:24:55.941378+00:00';
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id = v_order_id AND payment_type IN ('deposit', 'security_deposit')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.payments (id, store_id, order_id, raw_order_id, payment_type, amount, payment_method_id,
                               transaction_date, customer_id, account_id, notes, created_at)
  VALUES (v_payment_id, 'store-lolas', v_order_id, '9d906d86-fbc9-4f82-83ce-962c9ea06bdf', 'deposit', 1000, 'Cash',
          '2026-11-22', 'f60f75d5-d769-420e-962f-2a5334917139', 'CASH-DEPOSIT-ENVELOPE',
          'Deposit method was not selected at activation; recorded 23 Nov 2026', v_at);

  INSERT INTO public.journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit,
                                      description, reference_type, reference_id, created_at)
  VALUES
    (gen_random_uuid()::text, v_tx_id, '2026-11', '2026-11-22', 'store-lolas', 'RECON-ADJ-EQUITY', 1000, 0,
     'LR-1122-8044 cash deposit: 22 Nov envelope adjustment moved to deposits held', 'reconciliation_adjustment', v_payment_id, v_at),
    (gen_random_uuid()::text, v_tx_id, '2026-11', '2026-11-22', 'store-lolas', 'DEPOSITS-HELD-LOLAS', 0, 1000,
     'LR-1122-8044 cash deposit liability', 'reconciliation_adjustment', v_payment_id, v_at);
END;
$$;
