-- Owner use can stay in force until staff cancel it. A null ends_at means
-- "until further notice" and still blocks availability for every later booking.

ALTER TABLE public.fleet_unavailability
  ALTER COLUMN ends_at DROP NOT NULL;

ALTER TABLE public.fleet_unavailability
  DROP CONSTRAINT IF EXISTS fleet_unavailability_valid_range;

ALTER TABLE public.fleet_unavailability
  ADD CONSTRAINT fleet_unavailability_valid_range
  CHECK (ends_at IS NULL OR starts_at < ends_at);

CREATE OR REPLACE FUNCTION public.allocation_boundaries(p_store text,p_type text,p_start timestamptz,p_end timestamptz)
RETURNS TABLE(at timestamptz) LANGUAGE sql STABLE AS $$
 SELECT DISTINCT x FROM (
 SELECT p_start x UNION ALL SELECT p_end
 UNION ALL SELECT generate_series(date_trunc('month',p_start AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila',(date_trunc('month',p_end AT TIME ZONE 'Asia/Manila')+interval '1 month') AT TIME ZONE 'Asia/Manila',interval '1 month')
 UNION ALL SELECT s.starts_at FROM public.capacity_reservation_segments s JOIN public.capacity_reservations r ON r.id=s.reservation_id WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 UNION ALL SELECT s.ends_at FROM public.capacity_reservation_segments s JOIN public.capacity_reservations r ON r.id=s.reservation_id WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 UNION ALL SELECT starts_on::timestamp AT TIME ZONE 'Asia/Manila' FROM public.partner_allocation_overrides WHERE store_id=p_store AND vehicle_type=p_type AND revoked_at IS NULL
 UNION ALL SELECT ends_before::timestamp AT TIME ZONE 'Asia/Manila' FROM public.partner_allocation_overrides WHERE store_id=p_store AND vehicle_type=p_type AND revoked_at IS NULL
 UNION ALL SELECT u.starts_at FROM public.fleet_unavailability u WHERE u.store_id=p_store AND u.cancelled_at IS NULL
 UNION ALL SELECT u.ends_at FROM public.fleet_unavailability u WHERE u.store_id=p_store AND u.cancelled_at IS NULL AND u.ends_at IS NOT NULL
 ) q WHERE x>=p_start AND x<=p_end ORDER BY x
$$;

CREATE OR REPLACE FUNCTION public.allocation_counts(p_store text,p_type text,p_model text,p_partner uuid,p_at timestamptz,p_ignore uuid DEFAULT NULL)
RETURNS TABLE(protected_free integer,shared_free integer,model_free integer,physical_free integer) LANGUAGE sql STABLE AS $$
 WITH units AS (
 SELECT f.* FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id JOIN public.partner_allocation_type_map t ON t.model_type=m.type
 WHERE f.store_id=p_store AND t.vehicle_type=p_type AND m.is_active AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')
 AND NOT EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=f.id AND u.cancelled_at IS NULL AND u.starts_at<=p_at AND (u.ends_at IS NULL OR u.ends_at>p_at))
 ), commitments AS (
 SELECT r.*,s.pool FROM public.capacity_reservations r JOIN public.capacity_reservation_segments s ON s.reservation_id=r.id
 WHERE r.store_id=p_store AND r.vehicle_type=p_type AND (r.released_at IS NULL OR r.released_at>now()) AND (r.expires_at IS NULL OR r.expires_at>now()) AND r.id IS DISTINCT FROM p_ignore AND s.starts_at<=p_at AND s.ends_at>p_at
 ), guarantees AS (
 SELECT coalesce(sum(public.allocation_qty(partner_id,p_type,p_at)),0)::integer qty FROM (SELECT DISTINCT partner_id FROM public.partner_allocations WHERE store_id=p_store AND vehicle_type=p_type) p
 )
 SELECT public.allocation_qty(p_partner,p_type,p_at)-(SELECT count(*)::integer FROM commitments WHERE partner_id=p_partner AND pool='guaranteed'),
 (SELECT count(*)::integer FROM units)-(SELECT qty FROM guarantees)-(SELECT count(*)::integer FROM commitments WHERE pool='shared'),
 (SELECT count(*)::integer FROM units WHERE model_id=p_model)-(SELECT count(*)::integer FROM commitments WHERE model_id=p_model),
 (SELECT count(*)::integer FROM units)-(SELECT count(*)::integer FROM commitments)
$$;

CREATE OR REPLACE FUNCTION public.allocation_reserve(p_source jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r public.capacity_reservations; old_r public.capacity_reservations; typ text; b record; c record; chosen text; old_pool text;
BEGIN
 SELECT t.vehicle_type INTO typ FROM public.vehicle_models m JOIN public.partner_allocation_type_map t ON t.model_type=m.type WHERE m.id=p_source->>'model_id';
 IF typ IS NULL THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: vehicle type classification required for model %',p_source->>'model_id'; END IF;
 SELECT * INTO old_r FROM public.capacity_reservations WHERE source_key=p_source->>'source_key';
 IF old_r.id IS NULL AND p_source->>'predecessor' IS NOT NULL THEN
  SELECT * INTO old_r FROM public.capacity_reservations WHERE source_key=p_source->>'predecessor';
  IF old_r.id IS NOT NULL THEN UPDATE public.capacity_reservations SET source_key=p_source->>'source_key' WHERE id=old_r.id; END IF;
 END IF;
 IF old_r.id IS NOT NULL AND old_r.partner_id IS DISTINCT FROM (p_source->>'partner_id')::uuid THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: cannot change partner on an existing capacity reservation'; END IF;
 IF old_r.id IS NOT NULL AND old_r.model_id=p_source->>'model_id' AND old_r.starts_at=(p_source->>'starts_at')::timestamptz AND old_r.ends_at=(p_source->>'ends_at')::timestamptz AND old_r.vehicle_id IS NOT DISTINCT FROM p_source->>'vehicle_id' AND old_r.released_at IS NULL THEN
  UPDATE public.capacity_reservations SET expires_at=(p_source->>'expires_at')::timestamptz, actual_start=coalesce(actual_start,(p_source->>'actual_start')::timestamptz) WHERE id=old_r.id;
  RETURN;
 END IF;
 r.id:=coalesce(old_r.id,gen_random_uuid()); r.source_key:=p_source->>'source_key';r.store_id:=p_source->>'store_id';r.partner_id:=(p_source->>'partner_id')::uuid;r.vehicle_type:=typ;r.model_id:=p_source->>'model_id';r.vehicle_id:=p_source->>'vehicle_id';r.starts_at:=(p_source->>'starts_at')::timestamptz;r.ends_at:=(p_source->>'ends_at')::timestamptz;r.expires_at:=(p_source->>'expires_at')::timestamptz;r.actual_start:=coalesce(old_r.actual_start,(p_source->>'actual_start')::timestamptz);
 PERFORM public.allocation_generate(r.store_id,(r.ends_at AT TIME ZONE 'Asia/Manila')::date);
 IF r.vehicle_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id WHERE f.id=r.vehicle_id AND f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')) OR EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=r.vehicle_id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND (u.ends_at IS NULL OR u.ends_at>r.starts_at))) THEN RAISE EXCEPTION 'ALLOCATION_CONFLICT: selected vehicle is unavailable'; END IF;
 IF r.vehicle_id IS NULL AND (
  SELECT count(*) FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id
  WHERE f.store_id=r.store_id AND f.model_id=r.model_id AND m.is_active
  AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Pending ORCR')
  AND NOT EXISTS(SELECT 1 FROM public.fleet_unavailability u WHERE u.vehicle_id=f.id AND u.cancelled_at IS NULL AND u.starts_at<r.ends_at AND (u.ends_at IS NULL OR u.ends_at>r.starts_at))
  AND NOT EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=f.id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at)
 ) <= (SELECT count(*) FROM public.capacity_reservations x WHERE x.vehicle_id IS NULL AND x.model_id=r.model_id AND x.store_id=r.store_id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: no vehicle of model % is free for the whole rental',r.model_id;
 END IF;
 IF r.vehicle_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=r.vehicle_id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: vehicle % is already reserved',r.vehicle_id USING ERRCODE='P0001';
 END IF;
 -- Keep old segment choices while validating, then replace them only after success.
 CREATE TEMP TABLE IF NOT EXISTS allocation_new_segments(starts_at timestamptz,ends_at timestamptz,pool text) ON COMMIT DROP;
 TRUNCATE pg_temp.allocation_new_segments;
 FOR b IN SELECT at,lead(at) OVER(ORDER BY at) until FROM public.allocation_boundaries(r.store_id,typ,r.starts_at,r.ends_at) LOOP
  CONTINUE WHEN b.until IS NULL;
  SELECT * INTO c FROM public.allocation_counts(r.store_id,typ,r.model_id,r.partner_id,b.at,r.id);
  SELECT pool INTO old_pool FROM public.capacity_reservation_segments WHERE reservation_id=r.id AND starts_at<=b.at AND ends_at>b.at;
  chosen:=coalesce(old_pool,CASE WHEN r.partner_id IS NOT NULL AND c.protected_free>0 THEN 'guaranteed' ELSE 'shared' END);
  IF c.model_free<1 OR c.physical_free<1 OR (chosen='guaranteed' AND c.protected_free<1) OR (chosen='shared' AND c.shared_free<1) THEN
   RAISE EXCEPTION 'ALLOCATION_CONFLICT: % at %, booking %',typ,b.at,r.source_key USING ERRCODE='P0001';
  END IF;
  INSERT INTO pg_temp.allocation_new_segments VALUES(b.at,b.until,chosen);
 END LOOP;
 INSERT INTO public.capacity_reservations SELECT r.* ON CONFLICT (id) DO UPDATE SET source_key=excluded.source_key,model_id=excluded.model_id,vehicle_id=excluded.vehicle_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,expires_at=excluded.expires_at,actual_start=excluded.actual_start,partner_id=excluded.partner_id,vehicle_type=excluded.vehicle_type,released_at=NULL;
 DELETE FROM public.capacity_reservation_segments WHERE reservation_id=r.id;
 INSERT INTO public.capacity_reservation_segments SELECT r.id,* FROM pg_temp.allocation_new_segments;
END $$;
