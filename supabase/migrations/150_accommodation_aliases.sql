-- ============================================================
-- 150: Accommodation aliases
--
-- Maps raw customer-entered accommodation names (from waivers)
-- to a single canonical name, enabling the referral dashboard
-- to group "Mao Mao", "Mao Mao Surf", "maomao" into one entry.
--
-- raw_name is stored normalised (lowercase + trimmed) so lookups
-- are case- and whitespace-insensitive.
-- canonical_name is stored as the display name staff prefer.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.accommodation_aliases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name       text        NOT NULL,
  canonical_name text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Normalised raw_name must be unique
CREATE UNIQUE INDEX IF NOT EXISTS accommodation_aliases_raw_name_idx
  ON public.accommodation_aliases (lower(trim(raw_name)));

CREATE TRIGGER accommodation_aliases_updated_at
  BEFORE UPDATE ON public.accommodation_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.accommodation_aliases ENABLE ROW LEVEL SECURITY;

-- Staff with dashboard access can read
CREATE POLICY accommodation_aliases_read ON public.accommodation_aliases
  FOR SELECT USING (public.has_permission('can_view_dashboard'));

-- Staff with settings access can insert / update / delete
CREATE POLICY accommodation_aliases_write ON public.accommodation_aliases
  FOR ALL USING (public.has_permission('can_edit_settings'));
