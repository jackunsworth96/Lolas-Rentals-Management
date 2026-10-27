-- Model capacity asks whether every booking can have its own vehicle for its
-- whole rental, instead of counting only vehicles free for the entire window.
-- A vehicle returning mid-window can serve a later booking, and a pending
-- model-level booking cannot be stranded by assigning its only vehicle.
-- Mirrors apps/api/src/lib/fleet-assignment.ts; keep them in step.

CREATE OR REPLACE FUNCTION public.allocation_fit(
 p_i integer, p_free double precision[], p_js double precision[], p_je double precision[],
 p_ok boolean[], p_next double precision[], p_group integer[], p_n integer
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v integer; nf double precision[]; steps integer;
BEGIN
 IF p_i > coalesce(array_length(p_js,1),0) THEN RETURN true; END IF;
 steps:=coalesce(nullif(current_setting('allocation.fit_steps',true),''),'0')::integer+1;
 PERFORM set_config('allocation.fit_steps',steps::text,true);
 IF steps>5000 THEN RETURN false; END IF;
 -- Vehicles with identical blocks are interchangeable; try the best fit first.
 FOR v IN
  SELECT c.s FROM (
   SELECT DISTINCT ON (p_group[s]) s FROM generate_series(1,p_n) s
   WHERE p_ok[(p_i-1)*p_n+s] AND p_free[s]<=p_js[p_i]
   ORDER BY p_group[s],s
  ) c ORDER BY p_next[(p_i-1)*p_n+c.s],c.s
 LOOP
  nf:=p_free; nf[v]:=p_je[p_i];
  IF public.allocation_fit(p_i+1,nf,p_js,p_je,p_ok,p_next,p_group,p_n) THEN RETURN true; END IF;
  IF current_setting('allocation.fit_steps')::integer>5000 THEN RETURN false; END IF;
 END LOOP;
 RETURN false;
END $$;

-- True when every unassigned booking of the model overlapping [p_start,p_end)
-- still gets a vehicle. With p_include, the period is added as a model-level
-- booking (p_vehicle NULL) or as a block on p_vehicle.
CREATE OR REPLACE FUNCTION public.allocation_model_fits(
 p_store text, p_model text, p_ignore uuid, p_start timestamptz, p_end timestamptz,
 p_vehicle text, p_include boolean DEFAULT true
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE h_start timestamptz; h_end timestamptz; n integer; js float8[]; je float8[]; ok boolean[]; nxt float8[]; grp integer[];
BEGIN
 PERFORM set_config('allocation.fit_steps','0',true);
 CREATE TEMP TABLE IF NOT EXISTS allocation_fit_jobs(s timestamptz,e timestamptz) ON COMMIT DROP;
 CREATE TEMP TABLE IF NOT EXISTS allocation_fit_vehicles(id text,vn integer) ON COMMIT DROP;
 CREATE TEMP TABLE IF NOT EXISTS allocation_fit_blocks(id text,s timestamptz,e timestamptz) ON COMMIT DROP;
 TRUNCATE pg_temp.allocation_fit_jobs,pg_temp.allocation_fit_vehicles,pg_temp.allocation_fit_blocks;

 INSERT INTO pg_temp.allocation_fit_jobs
 SELECT x.starts_at,least(x.ends_at,coalesce(x.released_at,x.ends_at)) FROM public.capacity_reservations x
 WHERE x.store_id=p_store AND x.model_id=p_model AND x.vehicle_id IS NULL AND x.id IS DISTINCT FROM p_ignore
 AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now())
 AND x.starts_at<p_end AND x.ends_at>p_start;
 IF p_include AND p_vehicle IS NULL THEN INSERT INTO pg_temp.allocation_fit_jobs VALUES(p_start,p_end); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.allocation_fit_jobs) THEN RETURN true; END IF;
 SELECT least(p_start,min(s)),greatest(p_end,max(e)) INTO h_start,h_end FROM pg_temp.allocation_fit_jobs;

 INSERT INTO pg_temp.allocation_fit_vehicles
 SELECT f.id,row_number() OVER (ORDER BY f.id) FROM public.fleet f JOIN public.vehicle_models m ON m.id=f.model_id
 WHERE f.store_id=p_store AND f.model_id=p_model AND m.is_active
 AND f.status NOT IN ('Under Maintenance','Maintenance','Inactive','Sold','Service Vehicle','Closed','Retired','Pending ORCR');
 SELECT count(*) INTO n FROM pg_temp.allocation_fit_vehicles;
 IF n=0 THEN RETURN false; END IF;

 INSERT INTO pg_temp.allocation_fit_blocks
 SELECT x.vehicle_id,x.starts_at,least(x.ends_at,coalesce(x.released_at,x.ends_at)) FROM public.capacity_reservations x
 JOIN pg_temp.allocation_fit_vehicles v ON v.id=x.vehicle_id
 WHERE x.id IS DISTINCT FROM p_ignore
 AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now())
 AND x.starts_at<h_end AND x.ends_at>h_start
 UNION ALL
 SELECT u.vehicle_id,u.starts_at,coalesce(u.ends_at,'infinity') FROM public.fleet_unavailability u
 JOIN pg_temp.allocation_fit_vehicles v ON v.id=u.vehicle_id
 WHERE u.cancelled_at IS NULL AND u.starts_at<h_end AND (u.ends_at IS NULL OR u.ends_at>h_start);
 IF p_include AND p_vehicle IS NOT NULL THEN INSERT INTO pg_temp.allocation_fit_blocks VALUES(p_vehicle,p_start,p_end); END IF;

 WITH j AS (SELECT s,e,row_number() OVER (ORDER BY s,e DESC) jn FROM pg_temp.allocation_fit_jobs)
 SELECT array_agg(extract(epoch FROM s)::float8 ORDER BY jn),array_agg(extract(epoch FROM e)::float8 ORDER BY jn)
 INTO js,je FROM j;
 WITH j AS (SELECT s,e,row_number() OVER (ORDER BY s,e DESC) jn FROM pg_temp.allocation_fit_jobs)
 SELECT array_agg(NOT EXISTS(SELECT 1 FROM pg_temp.allocation_fit_blocks b WHERE b.id=v.id AND b.s<j.e AND b.e>j.s) ORDER BY j.jn,v.vn),
  array_agg(coalesce((SELECT extract(epoch FROM min(b.s))::float8 FROM pg_temp.allocation_fit_blocks b WHERE b.id=v.id AND b.s>=j.e),'infinity'::float8) ORDER BY j.jn,v.vn)
 INTO ok,nxt FROM j CROSS JOIN pg_temp.allocation_fit_vehicles v;
 SELECT array_agg(g ORDER BY vn) INTO grp FROM (
  SELECT v.vn,dense_rank() OVER (ORDER BY coalesce((SELECT string_agg(b.s::text||'/'||b.e::text,',' ORDER BY b.s,b.e) FROM pg_temp.allocation_fit_blocks b WHERE b.id=v.id),'')) g
  FROM pg_temp.allocation_fit_vehicles v
 ) q;

 RETURN public.allocation_fit(1,array_fill('-infinity'::float8,ARRAY[n]),js,je,ok,nxt,grp,n);
END $$;

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
 IF r.vehicle_id IS NULL AND NOT public.allocation_model_fits(r.store_id,r.model_id,r.id,r.starts_at,r.ends_at,NULL) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: no vehicle of model % is free for the whole rental',r.model_id;
 END IF;
 IF r.vehicle_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.capacity_reservations x WHERE x.vehicle_id=r.vehicle_id AND x.id<>r.id AND (x.released_at IS NULL OR x.released_at>now()) AND (x.expires_at IS NULL OR x.expires_at>now()) AND x.starts_at<r.ends_at AND x.ends_at>r.starts_at) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: vehicle % is already reserved',r.vehicle_id USING ERRCODE='P0001';
 END IF;
 -- Only blame this assignment when the existing bookings fit without it.
 IF r.vehicle_id IS NOT NULL
  AND NOT public.allocation_model_fits(r.store_id,r.model_id,r.id,r.starts_at,r.ends_at,r.vehicle_id)
  AND public.allocation_model_fits(r.store_id,r.model_id,r.id,r.starts_at,r.ends_at,r.vehicle_id,false) THEN
  RAISE EXCEPTION 'ALLOCATION_CONFLICT: % is needed for another booking on these dates; choose a different vehicle',
   coalesce((SELECT name FROM public.fleet WHERE id=r.vehicle_id),r.vehicle_id);
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
