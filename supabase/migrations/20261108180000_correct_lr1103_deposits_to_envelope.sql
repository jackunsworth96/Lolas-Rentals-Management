-- LR-1103-B006 and LR-1103-A533 took cash deposits alongside bank-transfer
-- rentals, and activation booked the deposits to the rental's account (Wise).
-- The cash is in the envelope; nothing is held in Wise.
UPDATE payments
SET account_id = 'CASH-DEPOSIT-ENVELOPE'
WHERE id IN ('f37e79aa-1bee-4f3f-a282-5548891dd9bf', 'ad1dc92b-5406-41b8-b2a8-f5ff1f01cad3')
  AND account_id = 'Wise';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = 'tx-fix-lr1103-deposits-20261108') THEN
    RETURN;
  END IF;
  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, 'tx-fix-lr1103-deposits-20261108', '2026-11', '2026-11-08', 'store-lolas', 'CASH-DEPOSIT-ENVELOPE', 2000, 0,
     'Correction: LR-1103-B006 and LR-1103-A533 cash deposits were recorded into Wise instead of the deposit envelope', 'deposit_envelope_transfer', 'f37e79aa-1bee-4f3f-a282-5548891dd9bf'),
    (gen_random_uuid()::text, 'tx-fix-lr1103-deposits-20261108', '2026-11', '2026-11-08', 'store-lolas', 'Wise', 0, 2000,
     'Correction: LR-1103-B006 and LR-1103-A533 cash deposits were recorded into Wise instead of the deposit envelope', 'deposit_envelope_transfer', 'ad1dc92b-5406-41b8-b2a8-f5ff1f01cad3');
END $$;
