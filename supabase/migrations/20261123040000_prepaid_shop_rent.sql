-- Landlord rent paid in advance is held as Prepaid Rent (asset) and released to Rent on the
-- 1st of each month it covers.
--   Main shop (4,000/month): 20,000 handed over from the safe on 23 Nov for Dec 2026 - Apr 2027.
--   Shop 3 (10,000/month): 10,000 paid from the till on 17 Nov for December, logged as November Rent.
--     That expense row stays (cash-up reads it); the cost is moved out of November here.
-- Releases are dated in the future so nobody has to post them on the day.

INSERT INTO chart_of_accounts (id, name, account_type, store_id, is_active) VALUES
  ('PREPAID-RENT-MAIN-store-lolas',  'Prepaid Rent - Main Shop', 'Asset', 'store-lolas', true),
  ('PREPAID-RENT-SHOP3-store-lolas', 'Prepaid Rent - Shop 3',    'Asset', 'store-lolas', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_safe_before numeric;
  v_nov_rent_before numeric;
  r record;
  v_tx text;
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE reference_id LIKE 'prepaid-rent:%') THEN
    RAISE NOTICE 'Prepaid rent entries already posted';
    RETURN;
  END IF;

  SELECT coalesce(sum(debit - credit), 0) INTO v_safe_before FROM journal_entries WHERE account_id = 'SAFE-store-lolas';
  SELECT coalesce(sum(debit - credit), 0) INTO v_nov_rent_before FROM journal_entries
    WHERE account_id = 'EXP-RENT-store-lolas' AND date BETWEEN '2026-11-01' AND '2026-11-30';

  FOR r IN
    SELECT * FROM (VALUES
      (DATE '2026-11-23', 'PREPAID-RENT-MAIN-store-lolas',  'SAFE-store-lolas',               20000, 'Main shop rent Dec 2026 - Apr 2027 paid in advance to landlord', 'prepaid-rent:main:paid'),
      (DATE '2026-11-23', 'PREPAID-RENT-SHOP3-store-lolas', 'EXP-RENT-store-lolas',           10000, 'Move Shop 3 December rent paid 17 Nov out of November',          'prepaid-rent:shop3:paid'),
      (DATE '2026-12-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-MAIN-store-lolas',   4000, 'Main shop rent December 2026 (prepaid)',                         'prepaid-rent:main:2026-12'),
      (DATE '2026-12-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-SHOP3-store-lolas', 10000, 'Shop 3 rent December 2026 (prepaid)',                            'prepaid-rent:shop3:2026-12'),
      (DATE '2027-01-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-MAIN-store-lolas',   4000, 'Main shop rent January 2027 (prepaid)',                          'prepaid-rent:main:2027-01'),
      (DATE '2027-02-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-MAIN-store-lolas',   4000, 'Main shop rent February 2027 (prepaid)',                         'prepaid-rent:main:2027-02'),
      (DATE '2027-03-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-MAIN-store-lolas',   4000, 'Main shop rent March 2027 (prepaid)',                            'prepaid-rent:main:2027-03'),
      (DATE '2027-04-01', 'EXP-RENT-store-lolas',           'PREPAID-RENT-MAIN-store-lolas',   4000, 'Main shop rent April 2027 (prepaid)',                            'prepaid-rent:main:2027-04')
    ) AS t(d, debit_acct, credit_acct, amt, memo, ref)
  LOOP
    v_tx := gen_random_uuid()::text;
    INSERT INTO journal_entries
      (id, transaction_id, period, date, store_id, account_id, description, debit, credit, reference_type, reference_id)
    VALUES
      (gen_random_uuid()::text, v_tx, to_char(r.d, 'YYYY-MM'), r.d, 'store-lolas', r.debit_acct,  r.memo, r.amt, 0, 'adjustment', r.ref),
      (gen_random_uuid()::text, v_tx, to_char(r.d, 'YYYY-MM'), r.d, 'store-lolas', r.credit_acct, r.memo, 0, r.amt, 'adjustment', r.ref);
  END LOOP;

  IF (SELECT sum(debit - credit) FROM journal_entries WHERE account_id = 'SAFE-store-lolas') <> v_safe_before - 20000 THEN
    RAISE EXCEPTION 'Safe should drop by exactly 20,000';
  END IF;
  IF (SELECT coalesce(sum(debit - credit), 0) FROM journal_entries
      WHERE account_id = 'EXP-RENT-store-lolas' AND date BETWEEN '2026-11-01' AND '2026-11-30') <> v_nov_rent_before - 10000 THEN
    RAISE EXCEPTION 'November rent should drop by exactly 10,000';
  END IF;
  IF (SELECT sum(debit - credit) FROM journal_entries WHERE account_id = 'PREPAID-RENT-MAIN-store-lolas') <> 0
     OR (SELECT sum(debit - credit) FROM journal_entries WHERE account_id = 'PREPAID-RENT-SHOP3-store-lolas') <> 0 THEN
    RAISE EXCEPTION 'Prepaid rent should be fully released by April 2027';
  END IF;
END $$;
