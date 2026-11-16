-- Vehicles Lola's rents out but does not own (Claire's) stay in the fleet for bookings, but are
-- not company assets: no depreciation, not in the asset register.
--
-- Tanggol: Claire paid for it herself; the 10 Oct purchase "from the safe" was a wrong entry.
-- The 8 Nov safe count already absorbed that wrong credit into RECON-ADJ-EQUITY, so reversing it
-- must not move the safe: the asset comes off against the count adjustment instead.
-- Past depreciation batches (Apr–Jul) are left as posted; they are not split per vehicle.

ALTER TABLE fleet ADD COLUMN IF NOT EXISTS is_company_asset boolean NOT NULL DEFAULT true;

-- Cardo, Amber and Kimchi (retired, archived BASS store) are read-only and left as they are.
UPDATE fleet f SET is_company_asset = false
WHERE f.owner = 'Claire' AND EXISTS (SELECT 1 FROM stores s WHERE s.id = f.store_id AND s.is_active);

DO $$
DECLARE
  v_tanggol text := '836311b1-8f91-4168-9333-e666c5692669';
  v_purchase_tx text := '0b4918fc-7ce6-404b-9c52-f96cc3c29f10';
  v_safe_before numeric;
  v_tx1 text := gen_random_uuid()::text;
  v_tx2 text := gen_random_uuid()::text;
  v_memo text := 'Reverse Tanggol purchase: Claire paid for it herself, not from the safe';
  v_memo2 text := 'Safe count 8 Nov already covered the wrong Tanggol safe payment';
BEGIN
  IF (SELECT count(*) FROM fleet WHERE owner = 'Claire' AND NOT is_company_asset) <> 3 THEN
    RAISE EXCEPTION 'Expected 3 active Claire vehicles';
  END IF;
  IF (SELECT sum(debit) FROM journal_entries WHERE transaction_id = v_purchase_tx AND account_id = 'ASSET-FLEET') <> 79600 THEN
    RAISE EXCEPTION 'Tanggol purchase journal not found';
  END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_id = v_tanggol AND description = v_memo) THEN
    RAISE EXCEPTION 'Tanggol purchase already reversed';
  END IF;

  SELECT sum(debit - credit) INTO v_safe_before FROM journal_entries WHERE account_id = 'SAFE-store-lolas';

  INSERT INTO journal_entries
    (id, transaction_id, period, date, store_id, account_id, description, debit, credit, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, v_tx1, '2026-10', DATE '2026-10-10', 'company', 'SAFE-store-lolas', v_memo, 79600, 0, 'vehicle', v_tanggol),
    (gen_random_uuid()::text, v_tx1, '2026-10', DATE '2026-10-10', 'company', 'ASSET-FLEET',      v_memo, 0, 79600, 'vehicle', v_tanggol),
    (gen_random_uuid()::text, v_tx2, '2026-11', DATE '2026-11-08', 'company', 'RECON-ADJ-EQUITY', v_memo2, 79600, 0, 'reconciliation_adjustment', v_tanggol),
    (gen_random_uuid()::text, v_tx2, '2026-11', DATE '2026-11-08', 'company', 'SAFE-store-lolas', v_memo2, 0, 79600, 'reconciliation_adjustment', v_tanggol);

  IF (SELECT sum(debit - credit) FROM journal_entries WHERE account_id = 'SAFE-store-lolas') <> v_safe_before THEN
    RAISE EXCEPTION 'Safe balance moved';
  END IF;
END $$;
