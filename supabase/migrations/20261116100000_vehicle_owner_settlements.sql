-- Outside vehicle owners (Claire): Lola's rents out their bikes, keeps a management fee and owes
-- them the rest. What is owed sits in a liability account per owner; their personal costs paid by
-- Lola's and cash handed to them both reduce it.
--
-- Monthly: share = (revenue - vehicle costs) - fee_pct% of that (no fee on a loss).
-- Closing a month posts DR EXP-VEHICLE-OWNER-SHARE / CR the owner's payable.

INSERT INTO chart_of_accounts (id, name, account_type, store_id, is_active) VALUES
  ('DUE-TO-CLAIRE',           'Due to Claire - Vehicle Owner', 'Liability', 'company', true),
  ('EXP-VEHICLE-OWNER-SHARE', 'Vehicle Owner Share',           'Expense',   'company', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vehicle_owner_agreements (
  id                 text PRIMARY KEY,
  owner_name         text NOT NULL UNIQUE,   -- matches fleet.owner
  fee_pct            numeric(5,2) NOT NULL CHECK (fee_pct >= 0 AND fee_pct <= 100),
  payable_account_id text NOT NULL REFERENCES chart_of_accounts(id),
  start_period       text NOT NULL CHECK (start_period ~ '^\d{4}-\d{2}$'),
  is_active          boolean NOT NULL DEFAULT true,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_owner_agreements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.vehicle_owner_settlements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id   text NOT NULL REFERENCES vehicle_owner_agreements(id),
  period         text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  revenue        numeric(12,2) NOT NULL,
  vehicle_costs  numeric(12,2) NOT NULL,
  fee            numeric(12,2) NOT NULL,
  owner_share    numeric(12,2) NOT NULL,
  lines          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-vehicle revenue and cost lines at close
  transaction_id text,
  created_by     text REFERENCES employees(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, period)
);
ALTER TABLE public.vehicle_owner_settlements ENABLE ROW LEVEL SECURITY;
-- All access goes through the API server (service role).

INSERT INTO vehicle_owner_agreements (id, owner_name, fee_pct, payable_account_id, start_period, notes)
VALUES ('claire', 'Claire', 20, 'DUE-TO-CLAIRE', '2026-10',
        'Lola''s keeps 20% of each month''s net (revenue less vehicle costs). Claire''s personal costs and cash paid to her come off the balance.')
ON CONFLICT (id) DO NOTHING;

-- Closes one month: saves the snapshot and posts the share in a single transaction.
CREATE OR REPLACE FUNCTION public.post_vehicle_owner_settlement(
  p_agreement_id  text,
  p_period        text,
  p_revenue       numeric,
  p_vehicle_costs numeric,
  p_lines         jsonb,
  p_created_by    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agreement vehicle_owner_agreements%ROWTYPE;
  v_net       numeric := round(p_revenue - p_vehicle_costs, 2);
  v_fee       numeric;
  v_share     numeric;
  v_tx        text;
  v_date      date := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_memo      text;
  v_settlement uuid;
BEGIN
  SELECT * INTO v_agreement FROM vehicle_owner_agreements WHERE id = p_agreement_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle owner agreement % not found', p_agreement_id; END IF;
  IF p_period < v_agreement.start_period THEN
    RAISE EXCEPTION 'The agreement with % starts in %', v_agreement.owner_name, v_agreement.start_period;
  END IF;
  IF v_date >= (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION '% has not finished yet', p_period;
  END IF;
  IF EXISTS (SELECT 1 FROM vehicle_owner_settlements WHERE agreement_id = p_agreement_id AND period = p_period) THEN
    RAISE EXCEPTION '% is already closed for %', p_period, v_agreement.owner_name;
  END IF;

  v_fee := CASE WHEN v_net > 0 THEN round(v_net * v_agreement.fee_pct / 100, 2) ELSE 0 END;
  v_share := v_net - v_fee;
  v_memo := format('%s vehicle share %s', v_agreement.owner_name, p_period);

  IF v_share <> 0 THEN
    v_tx := gen_random_uuid()::text;
    INSERT INTO journal_entries
      (id, transaction_id, period, date, store_id, account_id, description, debit, credit, reference_type, reference_id, created_by)
    VALUES
      (gen_random_uuid()::text, v_tx, p_period, v_date, 'company', 'EXP-VEHICLE-OWNER-SHARE', v_memo,
       greatest(v_share, 0), greatest(-v_share, 0), 'owner_settlement', p_agreement_id || ':' || p_period, p_created_by),
      (gen_random_uuid()::text, v_tx, p_period, v_date, 'company', v_agreement.payable_account_id, v_memo,
       greatest(-v_share, 0), greatest(v_share, 0), 'owner_settlement', p_agreement_id || ':' || p_period, p_created_by);
  END IF;

  INSERT INTO vehicle_owner_settlements
    (agreement_id, period, revenue, vehicle_costs, fee, owner_share, lines, transaction_id, created_by)
  VALUES
    (p_agreement_id, p_period, round(p_revenue, 2), round(p_vehicle_costs, 2), v_fee, v_share, coalesce(p_lines, '{}'::jsonb), v_tx, p_created_by)
  RETURNING id INTO v_settlement;

  RETURN jsonb_build_object('settlement_id', v_settlement, 'transaction_id', v_tx, 'fee', v_fee, 'owner_share', v_share);
END $$;

REVOKE ALL ON FUNCTION public.post_vehicle_owner_settlement(text, text, numeric, numeric, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Claire's personal costs now come off what Lola's owes her instead of being a drawing.
UPDATE expense_categories
SET account_id = 'DUE-TO-CLAIRE',
    help_text  = 'Anything bought for Claire personally. Deducted from her vehicle payout.'
WHERE is_active AND name = 'Claire Personal';
