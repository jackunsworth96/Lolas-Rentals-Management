-- LR-1117-8D6E: a custom deal brought the price down to ₱3,385. The ₱1,060
-- cash refund on Nov 21 was recorded without "Reduces rental or extension
-- charge", so the charge stayed at ₱4,445 and the order showed ₱1,060 owing.
-- Reclassify that refund against the Nov 19 extension: lower final_total,
-- clear balance_due, and move the debit from the receivable to rental income.
-- The cash leg (₱1,060 out of CASH-LOLA) was real and is left as is.
DO $$
DECLARE
  v_order_id   text := 'f7813b29-c66f-51c5-af8c-d7bab9c68b54';
  v_refund_id  text := 'd0b4720e-7741-4649-bde4-335f3aed7e52';
  v_ext_id     text := 'fe3a1655-0fb0-4e3f-801f-def066b779fb';
  v_item_id    text := '1e590b71-47cb-4cf8-b2bc-7562b1aa65cc';
  v_tx         text := 'tx-fix-20261121-lr1117-refund-revenue';
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = v_tx) THEN
    RETURN;
  END IF;

  UPDATE payments
  SET refund_affects_rental_revenue = true,
      refund_revenue_source         = 'extension',
      refund_source_payment_id      = v_ext_id,
      order_item_id                 = v_item_id,
      notes                         = COALESCE(notes, 'Custom deal: price agreed at ₱3,385')
  WHERE id = v_refund_id AND order_id = v_order_id AND payment_type = 'refund';

  UPDATE orders
  SET final_total = final_total - 1060,
      balance_due = 0,
      updated_at  = now()
  WHERE id = v_order_id AND final_total = 4445;

  INSERT INTO journal_entries (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, v_tx, '2026-11', '2026-11-21', 'store-lolas', 'INCOME-RENTAL-store-lolas', 1060, 0,
     'Correction: LR-1117-8D6E refund reduces the extension charge (custom deal)', 'refund', v_refund_id),
    (gen_random_uuid()::text, v_tx, '2026-11', '2026-11-21', 'store-lolas', 'CARD-TERMINAL-store-lolas', 0, 1060,
     'Correction: LR-1117-8D6E refund reduces the extension charge (custom deal)', 'refund', v_refund_id);

  INSERT INTO order_notes (id, order_id, store_id, kind, body, meta)
  VALUES (gen_random_uuid()::text, v_order_id, 'store-lolas', 'note',
          'Custom deal: total reduced from ₱4,445 to ₱3,385. The ₱1,060 refund now reduces the Nov 19 extension, so nothing is owed.',
          jsonb_build_object('correction', v_tx));
END $$;
