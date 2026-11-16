-- October 2026: Claire was handed 2,522 from the safe for her rental revenue. Itemised statements
-- start in November, so October is closed as an agreed amount and paid in full (balance 0 into Nov).
-- The 8 Nov safe count already reflected this cash being gone (the shortfall went to
-- RECON-ADJ-EQUITY), so the count adjustment is corrected and the safe balance does not move.

DO $$
DECLARE
  v_share_tx  text := gen_random_uuid()::text;
  v_payout_tx text := gen_random_uuid()::text;
  v_recon_tx  text := gen_random_uuid()::text;
  v_safe_before numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM vehicle_owner_settlements WHERE agreement_id = 'claire' AND period = '2026-10') THEN
    RAISE EXCEPTION 'October already closed for Claire';
  END IF;

  SELECT sum(debit - credit) INTO v_safe_before FROM journal_entries WHERE account_id = 'SAFE-store-lolas';

  INSERT INTO journal_entries
    (id, transaction_id, period, date, store_id, account_id, description, debit, credit, reference_type, reference_id)
  VALUES
    (gen_random_uuid()::text, v_share_tx, '2026-10', DATE '2026-10-31', 'company', 'EXP-VEHICLE-OWNER-SHARE',
     'Claire vehicle share 2026-10 (agreed amount)', 2522, 0, 'owner_settlement', 'claire:2026-10'),
    (gen_random_uuid()::text, v_share_tx, '2026-10', DATE '2026-10-31', 'company', 'DUE-TO-CLAIRE',
     'Claire vehicle share 2026-10 (agreed amount)', 0, 2522, 'owner_settlement', 'claire:2026-10'),
    (gen_random_uuid()::text, v_payout_tx, '2026-10', DATE '2026-10-31', 'company', 'DUE-TO-CLAIRE',
     'Paid to Claire — October rental revenue, cash from the safe', 2522, 0, 'owner_payout', 'claire'),
    (gen_random_uuid()::text, v_payout_tx, '2026-10', DATE '2026-10-31', 'company', 'SAFE-store-lolas',
     'Paid to Claire — October rental revenue, cash from the safe', 0, 2522, 'owner_payout', 'claire'),
    (gen_random_uuid()::text, v_recon_tx, '2026-11', DATE '2026-11-08', 'company', 'SAFE-store-lolas',
     'Safe count 8 Nov already covered the October payout to Claire', 2522, 0, 'reconciliation_adjustment', 'claire'),
    (gen_random_uuid()::text, v_recon_tx, '2026-11', DATE '2026-11-08', 'company', 'RECON-ADJ-EQUITY',
     'Safe count 8 Nov already covered the October payout to Claire', 0, 2522, 'reconciliation_adjustment', 'claire');

  INSERT INTO vehicle_owner_settlements
    (agreement_id, period, revenue, vehicle_costs, fee, owner_share, lines, transaction_id, note)
  VALUES
    ('claire', '2026-10', 0, 0, 0, 2522, '{}'::jsonb, v_share_tx,
     'Agreed cash settlement of 2,522 paid from the safe in October. Itemised statements start in November 2026.');

  IF (SELECT sum(debit - credit) FROM journal_entries WHERE account_id = 'SAFE-store-lolas') <> v_safe_before THEN
    RAISE EXCEPTION 'Safe balance moved';
  END IF;
  IF (SELECT sum(credit - debit) FROM journal_entries WHERE account_id = 'DUE-TO-CLAIRE' AND date < '2026-11-01') <> 0 THEN
    RAISE EXCEPTION 'Claire should start November at zero';
  END IF;
END $$;
