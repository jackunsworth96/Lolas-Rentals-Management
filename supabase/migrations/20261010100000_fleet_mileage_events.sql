-- Mileage corrections and inspection updates.
-- Inspections stay immutable. This log explains later changes to fleet.current_mileage.
-- Writes go through the API with the service role. Staff can read their own store.

CREATE TABLE public.fleet_mileage_events (
  id                text PRIMARY KEY,
  vehicle_id        text NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,
  store_id          text NOT NULL REFERENCES public.stores(id),
  previous_mileage  numeric(10,1) NOT NULL,
  new_mileage       numeric(10,1) NOT NULL,
  source            text NOT NULL CHECK (source IN ('manual', 'inspection')),
  reason            text,
  employee_id       text REFERENCES public.employees(id) ON DELETE SET NULL,
  inspection_id     uuid REFERENCES public.inspections(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_mileage_events_source_shape CHECK (
    (source = 'inspection' AND inspection_id IS NOT NULL AND reason IS NULL)
    OR (source = 'manual' AND inspection_id IS NULL)
  )
);

CREATE INDEX fleet_mileage_events_vehicle_created
  ON public.fleet_mileage_events (vehicle_id, created_at DESC);

ALTER TABLE public.fleet_mileage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY fleet_mileage_events_select ON public.fleet_mileage_events
  FOR SELECT USING (store_id = ANY(public.user_store_ids()));
