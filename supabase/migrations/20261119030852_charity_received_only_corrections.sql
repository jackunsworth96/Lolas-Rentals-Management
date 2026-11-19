-- Charity donations must only count once actually received.
--
-- 1. Web bookings used to post DR CASH-CHARITY-WALLET / CR CHARITY-PAYABLE at
--    submission, and processing posted the donation again. Reverse the two
--    submission postings made after the 8 Nov reconciliation baseline
--    (earlier ones were overwritten by the baseline).
-- 2. The baseline set CHARITY-PAYABLE to the dashboard figure of the day
--    (₱2,933 legacy + every orders_raw donation), which included ₱24,100 that
--    was never owed: cancelled bookings (₱6,500), one never-processed booking
--    (₱100) and the ₱17,500 Eco Hub direct donation that had already been paid.
-- 3. The Eco Hub ₱17,500 placeholder in orders_raw moves to
--    charity_offledger_donations, replacing the ₱14,500 row that was the same gift.

insert into public.journal_entries
  (id, transaction_id, period, date, store_id, account_id, debit, credit, description, reference_type, reference_id, created_by)
values
  ('je-charity-dup-rev-20261113-1', 'tx-charity-dup-rev-LR-1113-E45F', '2026-11', '2026-11-13', 'store-lolas',
   'CHARITY-PAYABLE', 100, 0, 'Reverse duplicate booking-time charity posting — LR-1113-E45F', 'adjustment', '15c9bee3-779d-48ad-9c46-84f7de3dd598', null),
  ('je-charity-dup-rev-20261113-2', 'tx-charity-dup-rev-LR-1113-E45F', '2026-11', '2026-11-13', 'store-lolas',
   'CASH-CHARITY-WALLET', 0, 100, 'Reverse duplicate booking-time charity posting — LR-1113-E45F', 'adjustment', '15c9bee3-779d-48ad-9c46-84f7de3dd598', null),
  ('je-charity-dup-rev-20261114-1', 'tx-charity-dup-rev-LR-1113-FAFE', '2026-11', '2026-11-14', 'store-lolas',
   'CHARITY-PAYABLE', 500, 0, 'Reverse duplicate booking-time charity posting — LR-1113-FAFE', 'adjustment', '78235034-f63d-4bca-93f2-b6bd324097e7', null),
  ('je-charity-dup-rev-20261114-2', 'tx-charity-dup-rev-LR-1113-FAFE', '2026-11', '2026-11-14', 'store-lolas',
   'CASH-CHARITY-WALLET', 0, 500, 'Reverse duplicate booking-time charity posting — LR-1113-FAFE', 'adjustment', '78235034-f63d-4bca-93f2-b6bd324097e7', null),
  ('je-recon-20261108-charity-fix-1', 'tx-recon-baseline-20261108-charity-fix', '2026-11', '2026-11-08', 'company',
   'CHARITY-PAYABLE', 24200, 0, 'Baseline correction — remove cancelled/unprocessed bookings and paid Eco Hub donation from charity owed', 'reconciliation_adjustment', 'tx-recon-baseline-20261108', null),
  ('je-recon-20261108-charity-fix-2', 'tx-recon-baseline-20261108-charity-fix', '2026-11', '2026-11-08', 'company',
   'RECON-ADJ-EQUITY', 0, 24200, 'Baseline correction — remove cancelled/unprocessed bookings and paid Eco Hub donation from charity owed', 'reconciliation_adjustment', 'tx-recon-baseline-20261108', null);

update public.charity_offledger_donations
set amount = 17500,
    date = '2026-06-05',
    note = 'Direct donation, recorded 5 Jun 2026 (previously a placeholder row in orders_raw)'
where recipient = 'Eco Hub Siargao' and amount = 14500;

delete from public.orders_raw
where id = '2ec6992d-5c76-4801-929a-ebc9b63d07f7'
  and charity_donation = 17500
  and order_reference is null;
