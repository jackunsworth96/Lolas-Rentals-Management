-- Transfer settlement workflow.
--
-- A transfer's fare is collected either by Lola's (reception, vehicle delivery,
-- pickup or return) or by the driver directly from the customer. Either way the
-- driver is settled later in one netted step:
--   Lola's collected  -> Lola's owes the driver the driver cut
--   driver collected  -> the driver owes Lola's the fare minus the driver cut
--
-- New columns on transfers:
--   collect_via             expected collector, set at booking ('lolas' | 'driver')
--   collected_by            who actually took (the last part of) the money
--   amount_paid             running total paid by the customer, whoever took it
--   driver_collected_amount portion of amount_paid the driver is holding
--   driver_cut              driver's cut, snapshotted at creation (per-head x pax)
--   billed_to_order         fare is part of the linked order's balance (AR)
--   driver_settled_at / driver_settlement_id

-- ── 1. Helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalise_transfer_van_type(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE regexp_replace(lower(coalesce(v, '')), '[\s_-]+', '', 'g')
    WHEN 'shared'        THEN 'shared_van'
    WHEN 'sharedvan'     THEN 'shared_van'
    WHEN 'private'       THEN 'private_van'
    WHEN 'privatevan'    THEN 'private_van'
    WHEN 'tuktuk'        THEN 'tuktuk'
    WHEN 'privatetuktuk' THEN 'tuktuk'
    ELSE v
  END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_route_driver_cut(
  p_store_id text,
  p_route text,
  p_van_type text,
  p_pax integer
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN tr.pricing_type = 'per_head'
              THEN tr.driver_cut * GREATEST(coalesce(p_pax, 1), 1)
              ELSE tr.driver_cut END
  FROM public.transfer_routes tr
  WHERE tr.store_id = p_store_id
    AND tr.route = p_route
    AND public.normalise_transfer_van_type(tr.van_type) = public.normalise_transfer_van_type(p_van_type)
    AND tr.driver_cut IS NOT NULL
  ORDER BY tr.is_active DESC
  LIMIT 1;
$$;

-- ── 2. Columns ────────────────────────────────────────────────────────────

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS collect_via text NOT NULL DEFAULT 'lolas',
  ADD COLUMN IF NOT EXISTS collected_by text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_collected_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_cut numeric(12,2),
  ADD COLUMN IF NOT EXISTS billed_to_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_settlement_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_collect_via_check') THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_collect_via_check CHECK (collect_via IN ('lolas', 'driver'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_collected_by_check') THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_collected_by_check CHECK (collected_by IS NULL OR collected_by IN ('lolas', 'driver'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transfers_open
  ON public.transfers (store_id, service_date)
  WHERE driver_settled_at IS NULL AND status <> 'cancelled';

-- ── 3. Insert trigger ─────────────────────────────────────────────────────
-- process_raw_order_atomic inserts transfers with a fixed column list, so the
-- snapshot and paid-at-activation state are filled in here.

CREATE OR REPLACE FUNCTION public.transfers_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.driver_cut IS NULL THEN
    NEW.driver_cut := public.transfer_route_driver_cut(NEW.store_id, NEW.route, NEW.van_type, NEW.pax_count);
  END IF;
  IF NEW.payment_status = 'Paid' AND coalesce(NEW.amount_paid, 0) = 0 THEN
    NEW.amount_paid := NEW.total_price;
    NEW.collected_by := coalesce(NEW.collected_by, NEW.collect_via, 'lolas');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfers_before_insert ON public.transfers;
CREATE TRIGGER trg_transfers_before_insert
  BEFORE INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.transfers_before_insert();

-- ── 4. Accounts and payment method ────────────────────────────────────────

INSERT INTO public.chart_of_accounts (id, name, account_type, store_id, is_active)
SELECT 'DRIVER-CLEARING-' || s.id, 'Driver Clearing (Transfers)', 'Asset', s.id, true
FROM public.stores s
WHERE s.is_active
  AND EXISTS (
    SELECT 1 FROM public.chart_of_accounts a WHERE a.id = 'INCOME-TRANSFER-' || s.id
  )
ON CONFLICT (id) DO NOTHING;

-- Used on order payments when the driver took a renter's transfer fare. Kept
-- inactive so it never appears in normal payment-method pickers.
INSERT INTO public.payment_methods (id, name, is_deposit_eligible, is_active, surcharge_percent, show_on_customer_website)
VALUES ('Driver Collected', 'Driver Collected', false, false, 0, false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Backfill ───────────────────────────────────────────────────────────
-- Archived stores are read-only (reject_archived_store_write), so every
-- backfill statement is limited to active stores.

UPDATE public.transfers t
SET driver_cut = public.transfer_route_driver_cut(t.store_id, t.route, t.van_type, t.pax_count)
WHERE t.driver_cut IS NULL
  AND t.store_id IN (SELECT id FROM public.stores WHERE is_active);

UPDATE public.transfers t
SET billed_to_order = true
WHERE t.order_id IS NOT NULL
  AND t.store_id IN (SELECT id FROM public.stores WHERE is_active)
  AND EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.reference_type = 'order'
      AND je.reference_id = t.order_id
      AND je.description ILIKE '%transfer fee receivable%'
  );

-- Order-linked transfers that were never billed through the order are the
-- "customer pays the driver" bookings.
UPDATE public.transfers t
SET collect_via = 'driver'
WHERE t.order_id IS NOT NULL AND NOT t.billed_to_order
  AND t.store_id IN (SELECT id FROM public.stores WHERE is_active);

-- Rebuild amount_paid from what was actually posted. Some legacy rows were
-- posted twice (Record Payment + Collect), so cap at the fare.
WITH posted AS (
  SELECT t.id,
         coalesce((
           SELECT sum(je.credit) FROM public.journal_entries je
           WHERE je.reference_type = 'transfer'
             AND je.reference_id = t.id
             AND je.description ILIKE '%income%'
         ), 0) AS journal_paid
  FROM public.transfers t
  WHERE t.store_id IN (SELECT id FROM public.stores WHERE is_active)
)
UPDATE public.transfers t
SET amount_paid = LEAST(
      t.total_price,
      GREATEST(
        p.journal_paid,
        coalesce(t.collected_amount, 0),
        CASE WHEN t.payment_status = 'Paid' THEN t.total_price ELSE 0 END
      )
    )
FROM posted p
WHERE p.id = t.id AND t.amount_paid = 0;

UPDATE public.transfers t
SET collected_by = CASE WHEN t.collect_via = 'driver' AND NOT t.billed_to_order THEN 'driver' ELSE 'lolas' END,
    driver_collected_amount = CASE WHEN t.collect_via = 'driver' AND NOT t.billed_to_order THEN t.amount_paid ELSE 0 END
WHERE t.amount_paid > 0 AND t.collected_by IS NULL
  AND t.store_id IN (SELECT id FROM public.stores WHERE is_active);

UPDATE public.transfers t
SET payment_status = CASE
      WHEN t.amount_paid <= 0 THEN 'Pending'
      WHEN t.amount_paid >= t.total_price THEN 'Paid'
      ELSE 'Partially Paid'
    END
WHERE t.store_id IN (SELECT id FROM public.stores WHERE is_active);

UPDATE public.transfers t
SET driver_settled_at = coalesce(t.updated_at, now())
WHERE t.driver_paid_status = 'Paid' AND t.driver_settled_at IS NULL
  AND t.store_id IN (SELECT id FROM public.stores WHERE is_active);

-- ── 6. Summary RPC ────────────────────────────────────────────────────────
-- Same response shape as before, now driven by the driver_cut snapshot and
-- amount_paid, plus a driver settlement block.

CREATE OR REPLACE FUNCTION public.get_transfer_summary(
  p_store_id text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outstanding jsonb;
  v_collected jsonb;
  v_settlement jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(total_price - amount_paid), 0)
  ) INTO v_outstanding
  FROM public.transfers
  WHERE store_id = p_store_id
    AND status <> 'cancelled'
    AND amount_paid < total_price
    AND (p_date_from IS NULL OR service_date >= p_date_from)
    AND (p_date_to IS NULL OR service_date <= p_date_to);

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total', COALESCE(SUM(amount_paid), 0),
    'driverCut', COALESCE(SUM(coalesce(driver_cut, 0)), 0),
    'netLolas', COALESCE(SUM(amount_paid), 0) - COALESCE(SUM(coalesce(driver_cut, 0)), 0)
  ) INTO v_collected
  FROM public.transfers
  WHERE store_id = p_store_id
    AND status <> 'cancelled'
    AND amount_paid > 0
    AND (p_date_from IS NULL OR service_date >= p_date_from)
    AND (p_date_to IS NULL OR service_date <= p_date_to);

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'lolasOwesDriver', COALESCE(SUM(coalesce(driver_cut, 0)), 0),
    'driverOwesLolas', COALESCE(SUM(driver_collected_amount), 0),
    'net', COALESCE(SUM(driver_collected_amount), 0) - COALESCE(SUM(coalesce(driver_cut, 0)), 0)
  ) INTO v_settlement
  FROM public.transfers
  WHERE store_id = p_store_id
    AND status <> 'cancelled'
    AND driver_settled_at IS NULL
    AND amount_paid > 0
    AND (p_date_from IS NULL OR service_date >= p_date_from)
    AND (p_date_to IS NULL OR service_date <= p_date_to);

  RETURN jsonb_build_object(
    'outstanding', v_outstanding,
    'collected', v_collected,
    'settlement', v_settlement
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transfer_summary(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transfer_summary(text, date, date) TO service_role;
