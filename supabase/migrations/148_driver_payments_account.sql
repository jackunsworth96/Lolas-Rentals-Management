-- Add a dedicated expense account for driver payments on transfers.
-- Previously there was no account for this, causing team members to
-- incorrectly use "Transfer Fee" (a bank charge account).

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES ('EXP-DRIVER-PAY', 'Driver Payments', 'Expense', 'company', true)
ON CONFLICT (id) DO NOTHING;
