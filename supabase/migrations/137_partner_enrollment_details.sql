-- ============================================================
-- 136: Partner enrolment Step 2 details
-- Stores the optional pre-qualification answers a partner can
-- submit after completing the short Step 1 enrolment form.
-- Each accommodation_partners row owns at most one details row.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_enrollment_details (
  partner_id                 uuid PRIMARY KEY
                              REFERENCES public.accommodation_partners(id)
                              ON DELETE CASCADE,
  property_type              text,
  room_count                 integer,
  star_rating                text,
  guest_profile              text,
  avg_length_of_stay         text,
  monthly_occupancy_pct      integer,
  existing_vehicle_provider  text,
  estimated_vehicles_per_month integer,
  peak_seasons               text,
  rental_type_preference     text,
  has_concierge              boolean,
  wants_printed_materials    boolean,
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.partner_enrollment_details ENABLE ROW LEVEL SECURITY;

-- Staff: full access to details rows for partners in their stores.
DROP POLICY IF EXISTS partner_enrollment_details_staff
  ON public.partner_enrollment_details;

CREATE POLICY partner_enrollment_details_staff
  ON public.partner_enrollment_details
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accommodation_partners ap
       WHERE ap.id = partner_enrollment_details.partner_id
         AND ap.store_id = ANY(public.user_store_ids())
    )
  );

-- Public (anon) self-enrolment: insert details for a partner that exists in
-- pending status. The partner_id must already exist (and was created moments
-- earlier from POST /partners/enroll).
DROP POLICY IF EXISTS partner_enrollment_details_public_insert
  ON public.partner_enrollment_details;

CREATE POLICY partner_enrollment_details_public_insert
  ON public.partner_enrollment_details
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accommodation_partners ap
       WHERE ap.id = partner_enrollment_details.partner_id
         AND ap.status = 'pending'
    )
  );
