-- ============================================================
-- Accounts reconciliation baseline — 8 Nov 2026
--
-- The ledger had drifted from the real balances because of past back-office
-- errors (missing bank/safe outflows, no Accounts Receivable account so order
-- receivables landed in "Card Payment Pending", charity payouts never
-- journaled, payroll advance deductions never credited). This migration:
--
--   1. Fixes the chart of accounts so name-based lookups resolve correctly:
--        - CARD-TERMINAL-store-lolas has been acting as the receivable for
--          every order; it is renamed "Accounts Receivable" so history stays
--          continuous, and a new CARD-PENDING account takes card routing.
--        - "Customer Deposits Received" is renamed so it no longer competes
--          with Deposits Held Lolas in the deposit-liability lookup.
--        - New CASH-DEPOSIT-ENVELOPE (customer deposit cash kept in the till
--          but counted separately) and RECON-ADJ-EQUITY accounts.
--   2. Posts ONE balanced transaction (tx-recon-baseline-20261108) that
--      brings every cash / bank / liability account to the counted figure.
--      Each line is computed as (target − ledger balance at apply time); the
--      net goes to RECON-ADJ-EQUITY.
--   3. Creates account_reconciliations (one row per count) and seeds it with
--      this baseline.
--   4. Adds account_balances(p_from, p_to) so balances are aggregated in SQL
--      (PostgREST caps plain selects at 1000 rows).
--
-- Balances are debit-minus-credit throughout (liabilities are negative).
-- Idempotent: skips the journal if the transaction already exists.
-- ============================================================

-- ── 1. Chart of accounts ────────────────────────────────────────────────────

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
VALUES
  ('RECON-ADJ-EQUITY', 'Reconciliation Adjustments', 'Equity', 'company', true),
  ('CASH-DEPOSIT-ENVELOPE', 'Cash — Customer Deposit Envelope', 'Asset', 'store-lolas', true),
  ('CARD-PENDING', 'Card Payment Pending', 'Asset', 'company', true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.chart_of_accounts SET name = 'Accounts Receivable'
WHERE id = 'CARD-TERMINAL-store-lolas';

UPDATE public.chart_of_accounts SET name = 'Prepaid Orders (Prior System)'
WHERE id = 'Customer Deposits Received';

UPDATE public.chart_of_accounts SET name = 'Cash Till (retired — use Cash Drawer Lola''s)'
WHERE id = 'CASH-TILL-store-lolas';

UPDATE public.payment_routing_rules
SET received_into_account_id = 'CARD-PENDING', updated_at = now()
WHERE store_id = 'store-lolas'
  AND received_into_account_id = 'CARD-TERMINAL-store-lolas';

-- ── 2. Reconciliation history table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_reconciliations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        text NOT NULL REFERENCES public.chart_of_accounts(id),
  as_of_date        date NOT NULL,
  ledger_balance    numeric(14,2) NOT NULL,
  counted_balance   numeric(14,2) NOT NULL,
  variance          numeric(14,2) NOT NULL,
  adjustment_tx_id  text,
  notes             text NOT NULL,
  created_by        text REFERENCES public.employees(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.account_reconciliations.ledger_balance IS
  'Ledger balance (debit − credit) through as_of_date before any adjustment.';
COMMENT ON COLUMN public.account_reconciliations.counted_balance IS
  'Counted / statement balance in the same debit − credit sign as ledger_balance.';

CREATE INDEX IF NOT EXISTS account_reconciliations_account_idx
  ON public.account_reconciliations (account_id, as_of_date DESC, created_at DESC);

ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.account_reconciliations TO service_role;

SELECT public.audit_attach('public.account_reconciliations');

CREATE INDEX IF NOT EXISTS journal_entries_account_date_idx
  ON public.journal_entries (account_id, date);

-- ── 3. Baseline journal ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_tx      constant text := 'tx-recon-baseline-20261108';
  v_date    constant date := DATE '2026-11-08';
  v_note    constant text := 'Reconciliation baseline 8 Nov 2026 — counted balance';
  v_net     numeric := 0;
  v_seq     int := 0;
  t         record;
  v_ledger  numeric;
  v_delta   numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE transaction_id = v_tx) THEN
    RAISE NOTICE 'Baseline % already posted — skipping', v_tx;
    RETURN;
  END IF;

  CREATE TEMP TABLE recon_targets (account_id text PRIMARY KEY, target numeric NOT NULL, label text NOT NULL) ON COMMIT DROP;

  INSERT INTO recon_targets VALUES
    ('Wise',                        101663.55, 'Wise statement'),
    ('BANK-BDO-store-lolas',          1849.52, 'BDO statement'),
    ('BANK-UNION-BANK-store-lolas',      0.00, 'Union Bank statement'),
    ('SAFE-store-lolas',            279652.25, 'Safe count'),
    ('GCASH-store-lolas',            32403.97, 'GCash balance (includes 4,000 customer deposits)'),
    ('CASH-LOLA',                    27518.00, 'Till float count'),
    ('CASH-DEPOSIT-ENVELOPE',        25000.00, 'Customer deposit envelope count'),
    ('CASH-CHARITY-WALLET',           7361.25, 'Charity cash count'),
    ('CARD-PENDING',                     0.00, 'No card payments pending'),
    ('CASH-BASS',                        0.00, 'BASS closed'),
    ('Customer Deposits Received',       0.00, 'No prior-system prepayments outstanding'),
    ('CHARITY-PAYABLE',             -33133.00, 'Charity donations owed'),
    ('DEPOSITS-HELD-LOLAS',         -29000.00, 'Customer deposits held (25,000 cash + 4,000 GCash)');

  -- Receivable = what customers on active rentals still owe.
  INSERT INTO recon_targets
  SELECT 'CARD-TERMINAL-store-lolas',
         coalesce((SELECT sum(balance_due) FROM public.orders WHERE status = 'active' AND balance_due > 0), 0),
         'Outstanding balances on active rentals';

  -- Staff advances = undeducted installments in HR schedules.
  INSERT INTO recon_targets
  SELECT 'Employee-Advance',
         coalesce((SELECT sum(installment_amount) FROM public.cash_advance_schedules WHERE NOT coalesce(deducted, false)), 0),
         'Outstanding staff cash advances (HR schedules)';

  CREATE TEMP TABLE recon_lines (
    id text, account_id text, description text, debit numeric, credit numeric,
    ledger numeric, target numeric
  ) ON COMMIT DROP;

  FOR t IN SELECT * FROM recon_targets ORDER BY account_id LOOP
    SELECT coalesce(sum(debit - credit), 0) INTO v_ledger
    FROM public.journal_entries WHERE account_id = t.account_id;

    v_delta := round(t.target - v_ledger, 2);
    v_seq := v_seq + 1;

    INSERT INTO recon_lines VALUES (
      format('je-recon-20261108-%s', lpad(v_seq::text, 2, '0')),
      t.account_id,
      format('%s: %s', v_note, t.label),
      greatest(v_delta, 0),
      greatest(-v_delta, 0),
      v_ledger,
      t.target
    );
    v_net := v_net + v_delta;
  END LOOP;

  v_seq := v_seq + 1;
  INSERT INTO recon_lines VALUES (
    format('je-recon-20261108-%s', lpad(v_seq::text, 2, '0')),
    'RECON-ADJ-EQUITY',
    'Reconciliation baseline 8 Nov 2026 — net of unrecorded historical movements',
    greatest(-v_net, 0),
    greatest(v_net, 0),
    0, 0
  );

  INSERT INTO public.journal_entries (
    id, transaction_id, period, date, store_id, account_id,
    description, debit, credit, reference_type, reference_id, created_by
  )
  SELECT id, v_tx, '2026-11', v_date, 'company', account_id,
         description, debit, credit, 'reconciliation_adjustment', v_tx, NULL
  FROM recon_lines
  WHERE debit > 0 OR credit > 0;

  IF (SELECT sum(debit) - sum(credit) FROM public.journal_entries WHERE transaction_id = v_tx) <> 0 THEN
    RAISE EXCEPTION 'Baseline transaction is unbalanced';
  END IF;

  INSERT INTO public.account_reconciliations (
    account_id, as_of_date, ledger_balance, counted_balance, variance, adjustment_tx_id, notes
  )
  SELECT l.account_id, v_date, l.ledger, l.target, l.target - l.ledger, v_tx,
         'Baseline: ' || r.label
  FROM recon_lines l
  JOIN recon_targets r USING (account_id);
END $$;

-- ── 4. Aggregated balances ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_balances(p_from date, p_to date)
RETURNS TABLE (
  account_id     text,
  opening_debit  numeric,
  opening_credit numeric,
  period_debit   numeric,
  period_credit  numeric
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    je.account_id,
    coalesce(sum(je.debit)  FILTER (WHERE je.date <  p_from), 0),
    coalesce(sum(je.credit) FILTER (WHERE je.date <  p_from), 0),
    coalesce(sum(je.debit)  FILTER (WHERE je.date >= p_from), 0),
    coalesce(sum(je.credit) FILTER (WHERE je.date >= p_from), 0)
  FROM public.journal_entries je
  WHERE je.date <= p_to
  GROUP BY je.account_id
$$;

REVOKE ALL ON FUNCTION public.account_balances(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_balances(date, date) TO service_role;
