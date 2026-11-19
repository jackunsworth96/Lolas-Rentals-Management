-- The never-owed amount in the 8 Nov charity baseline is ₱24,100
-- (cancelled bookings ₱6,500 + unprocessed ₱100 + paid Eco Hub ₱17,500), not ₱24,200.

update public.journal_entries
set debit = 24100
where id = 'je-recon-20261108-charity-fix-1' and account_id = 'CHARITY-PAYABLE';

update public.journal_entries
set credit = 24100
where id = 'je-recon-20261108-charity-fix-2' and account_id = 'RECON-ADJ-EQUITY';
