-- ============================================================
-- 134: Accommodation Partners deal types + self-enrolment status
-- Extends the partner record so we can offer customer-facing
-- benefits (discount, free delivery, combined) in addition to
-- staff commissions, and adds a `pending` status for partner
-- self-enrolment via the public /affiliates page.
-- ============================================================

-- ─── New columns on accommodation_partners ───────────────────────────────

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS deal_type text NOT NULL DEFAULT 'commission'
    CHECK (deal_type IN ('commission', 'discount', 'free_delivery', 'combined')),
  ADD COLUMN IF NOT EXISTS discount_type text
    CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS free_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_discount_days integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'rejected'));

-- Index pending partners so the back-office review queue is cheap.
CREATE INDEX IF NOT EXISTS idx_accommodation_partners_pending
  ON public.accommodation_partners(created_at DESC)
  WHERE status = 'pending';

-- ─── RLS update — allow public insert for self-enrolment ────────────────
-- Status is forced to 'pending' on enroll so this cannot be used to create
-- live partner records. Service-role staff API still controls activation.

DROP POLICY IF EXISTS accommodation_partners_public_enroll
  ON public.accommodation_partners;

CREATE POLICY accommodation_partners_public_enroll
  ON public.accommodation_partners
  FOR INSERT
  TO anon
  WITH CHECK (status = 'pending');

-- Public can read only active partners by slug (used by /book?ref= benefit lookup).
DROP POLICY IF EXISTS accommodation_partners_public_select
  ON public.accommodation_partners;

CREATE POLICY accommodation_partners_public_select
  ON public.accommodation_partners
  FOR SELECT
  TO anon
  USING (status = 'active' AND active = true);
