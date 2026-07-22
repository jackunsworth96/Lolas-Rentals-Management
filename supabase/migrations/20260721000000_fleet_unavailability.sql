-- Dated, non-financial fleet availability blocks (initially owner use only).
CREATE TABLE public.fleet_unavailability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  text NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,
  store_id    text NOT NULL REFERENCES public.stores(id),
  type        text NOT NULL DEFAULT 'owner_use'
              CHECK (type IN ('owner_use')),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  note        text,
  created_by  text REFERENCES public.employees(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by text REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_unavailability_valid_range CHECK (starts_at < ends_at)
);

CREATE INDEX idx_fleet_unavailability_vehicle_range
  ON public.fleet_unavailability (vehicle_id, starts_at, ends_at)
  WHERE cancelled_at IS NULL;

CREATE INDEX idx_fleet_unavailability_store_range
  ON public.fleet_unavailability (store_id, starts_at, ends_at)
  WHERE cancelled_at IS NULL;

CREATE TRIGGER fleet_unavailability_updated_at
  BEFORE UPDATE ON public.fleet_unavailability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY fleet_unavailability_select ON public.fleet_unavailability
  FOR SELECT USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_view_fleet')
  );

CREATE POLICY fleet_unavailability_modify ON public.fleet_unavailability
  FOR ALL USING (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_fleet')
  )
  WITH CHECK (
    store_id = ANY(public.user_store_ids())
    AND public.has_permission('can_edit_fleet')
  );
