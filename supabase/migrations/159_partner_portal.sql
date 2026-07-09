-- ============================================================
-- 159: Partner portal users and partner access flags
-- Adds a scoped login surface for accommodation partners without
-- reusing staff back-office users.
-- ============================================================

ALTER TABLE public.accommodation_partners
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_subdomain text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accommodation_partners_portal_subdomain
  ON public.accommodation_partners(portal_subdomain)
  WHERE portal_subdomain IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL REFERENCES public.accommodation_partners(id) ON DELETE CASCADE,
  name          text NOT NULL,
  username      text NOT NULL,
  pin_hash      text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, username)
);

CREATE INDEX IF NOT EXISTS idx_partner_users_partner_id
  ON public.partner_users(partner_id);

ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_users_staff_select ON public.partner_users;
CREATE POLICY partner_users_staff_select
  ON public.partner_users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accommodation_partners ap
       WHERE ap.id = partner_users.partner_id
         AND ap.store_id = ANY(public.user_store_ids())
    )
  );

DROP POLICY IF EXISTS partner_users_staff_modify ON public.partner_users;
CREATE POLICY partner_users_staff_modify
  ON public.partner_users
  FOR ALL
  USING (
    public.has_permission('can_edit_settings')
    AND EXISTS (
      SELECT 1 FROM public.accommodation_partners ap
       WHERE ap.id = partner_users.partner_id
         AND ap.store_id = ANY(public.user_store_ids())
    )
  )
  WITH CHECK (
    public.has_permission('can_edit_settings')
    AND EXISTS (
      SELECT 1 FROM public.accommodation_partners ap
       WHERE ap.id = partner_users.partner_id
         AND ap.store_id = ANY(public.user_store_ids())
    )
  );
