-- LR-1120-4A7D was fully paid (₱10 shortfall written off) but its extension IOU
-- was left pending. Settlement on 25 Nov treated the IOU as owed and applied the
-- ₱1,000 cash deposit, moving it from the envelope to the till. The deposit was
-- actually returned to the customer in cash from the envelope, so the 25 Nov
-- cash-up expected ₱1,000 more in the till than there was.
--
-- Record the settlement as a ₱1,000 cash deposit refund from the envelope:
-- add the deposit_refund payment, retarget the deposit-liability and envelope
-- legs to it, and drop the till / receivable legs.
DO $$
DECLARE
  v_order_id constant text := '69b8e20c-d283-545e-9b6e-641bf00ad866';
  v_refund_id constant text := 'c1a2b3d4-1120-44a7-8d00-000000000001';
  v_tx constant text := 'de11a6eb-81b2-441e-b54c-9d25165252bf';
  v_liability_leg constant text := 'bf7ea809-9eba-4c62-bddc-273affabc152';
  v_envelope_leg constant text := '63d60224-1daa-44db-99dc-e8da447714b4';
  v_till_leg constant text := '726c02ef-cf95-46dc-95f0-9f7cfdd3caca';
  v_receivable_leg constant text := '6f386b66-aa65-4a94-a010-28e143aade9e';
  v_updated int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE id = v_refund_id) THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.journal_entries
      WHERE transaction_id = v_tx
        AND (
          (id = v_liability_leg AND account_id = 'DEPOSITS-HELD-LOLAS' AND debit = 1000 AND reference_type = 'deposit')
          OR (id = v_envelope_leg AND account_id = 'CASH-DEPOSIT-ENVELOPE' AND credit = 1000 AND reference_type = 'deposit_envelope_transfer')
          OR (id = v_till_leg AND account_id = 'CASH-LOLA' AND debit = 1000 AND reference_type = 'deposit_envelope_transfer')
          OR (id = v_receivable_leg AND credit = 1000 AND reference_type = 'deposit')
        )) <> 4 THEN
    RAISE EXCEPTION 'LR-1120-4A7D settlement journal is not in the expected state';
  END IF;

  INSERT INTO public.payments (id, store_id, order_id, payment_type, amount, payment_method_id,
                               transaction_date, customer_id, account_id, notes, created_at)
  VALUES (v_refund_id, 'store-lolas', v_order_id, 'deposit_refund', 1000, 'Cash',
          '2026-11-25', '7c57cfb1-3abb-469d-8515-fca22d3b5b43', 'CASH-DEPOSIT-ENVELOPE',
          'Settlement applied the deposit to an already paid extension; corrected to a cash refund 25 Nov 2026',
          '2026-11-25T08:54:53.687694+00:00');

  UPDATE public.journal_entries
  SET description = 'Order ' || v_order_id || ' deposit refund',
      reference_type = 'refund',
      reference_id = v_refund_id
  WHERE id = v_liability_leg;

  UPDATE public.journal_entries
  SET description = 'Order ' || v_order_id || ' deposit refund to customer',
      reference_type = 'refund',
      reference_id = v_refund_id
  WHERE id = v_envelope_leg;

  DELETE FROM public.journal_entries WHERE id IN (v_till_leg, v_receivable_leg);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION 'LR-1120-4A7D till and receivable legs were not removed';
  END IF;

  IF (SELECT sum(debit) - sum(credit) FROM public.journal_entries WHERE transaction_id = v_tx) <> 0 THEN
    RAISE EXCEPTION 'LR-1120-4A7D settlement journal no longer balances';
  END IF;

  UPDATE public.orders SET balance_due = 0 WHERE id = v_order_id;
END;
$$;
