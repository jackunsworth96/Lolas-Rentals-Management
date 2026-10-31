-- Surf rack inventory.
-- Racks are a removable, store-level stock that clips onto any bike whose
-- fleet.surf_rack mount flag is set. Each booking carrying the Surf Rack add-on
-- holds rack(s) for its rental window via surf_rack_allocations; staff can
-- release a rack early (customer hands it back) without touching the price.

-- 1) Stock count per store.
alter table public.stores
  add column if not exists surf_rack_count integer not null default 0
    check (surf_rack_count >= 0);

-- 2) Tag catalog add-ons that draw from a tracked inventory.
alter table public.addons
  add column if not exists inventory_type text
    check (inventory_type in ('surf_rack'));

update public.addons set inventory_type = 'surf_rack'
where inventory_type is null and name ilike '%surf%rack%';

-- 3) Allocations: one row per Surf Rack order_addons row.
create table if not exists public.surf_rack_allocations (
  id               uuid primary key default gen_random_uuid(),
  store_id         text not null references public.stores(id),
  order_id         text not null references public.orders(id) on delete cascade,
  -- No FK: the allocation must outlive its add-on row so removal is auditable.
  order_addon_id   text,
  order_item_id    text references public.order_items(id) on delete set null,
  vehicle_id       text references public.fleet(id) on delete set null,
  quantity         integer not null default 1 check (quantity > 0),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  released_at      timestamptz,
  released_reason  text check (released_reason in ('removed', 'returned_early', 'cancelled')),
  employee_id      text references public.employees(id),
  created_at       timestamptz not null default now()
);

create unique index if not exists surf_rack_allocations_order_addon_idx
  on public.surf_rack_allocations (order_addon_id) where order_addon_id is not null;
create index if not exists surf_rack_allocations_active_window_idx
  on public.surf_rack_allocations (store_id, starts_at, ends_at) where released_at is null;
create index if not exists surf_rack_allocations_order_idx
  on public.surf_rack_allocations (order_id);

alter table public.surf_rack_allocations enable row level security;

create policy surf_rack_allocations_select on public.surf_rack_allocations
  for select using (store_id = any (public.user_store_ids()));

-- 4) Is this order_addons row a surf rack?
create or replace function public.is_surf_rack_addon(p_addon_name text, p_store_id text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.addons a
    where a.inventory_type = 'surf_rack'
      and lower(trim(a.name)) = lower(trim(p_addon_name))
      and (a.store_id = p_store_id or a.store_id is null)
  ) or coalesce(p_addon_name, '') ilike '%surf%rack%';
$$;

-- 5) Bring an order's allocations in line with its add-ons, items and status.
create or replace function public.sync_surf_rack_allocations(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_addon  record;
  v_item   record;
  v_alloc  record;
begin
  select status into v_status from public.orders where id = p_order_id;
  if v_status is null then
    return;
  end if;

  -- Create allocations for rack add-ons that don't have one yet.
  if v_status in ('active', 'confirmed') then
    for v_addon in
      select oa.* from public.order_addons oa
      where oa.order_id = p_order_id
        and public.is_surf_rack_addon(oa.addon_name, oa.store_id)
        and not exists (
          select 1 from public.surf_rack_allocations s where s.order_addon_id = oa.id
        )
    loop
      -- Prefer the add-on's own item, then an item on a rack-mount bike.
      select oi.* into v_item
      from public.order_items oi
      left join public.fleet f on f.id = oi.vehicle_id
      where oi.order_id = p_order_id
        and oi.pickup_datetime is not null
        and oi.dropoff_datetime is not null
      order by (oi.id = v_addon.order_item_id) desc nulls last,
               coalesce(f.surf_rack, false) desc,
               oi.created_at
      limit 1;

      if v_item.id is not null then
        insert into public.surf_rack_allocations (
          store_id, order_id, order_addon_id, order_item_id, vehicle_id,
          quantity, starts_at, ends_at, employee_id
        ) values (
          v_addon.store_id, p_order_id, v_addon.id, v_item.id, v_item.vehicle_id,
          greatest(coalesce(v_addon.quantity, 1), 1),
          v_item.pickup_datetime, v_item.dropoff_datetime, v_addon.employee_id
        );
      end if;
    end loop;
  end if;

  -- Follow vehicle swaps, extensions and date changes on the linked item.
  for v_alloc in
    select s.id, s.order_item_id from public.surf_rack_allocations s
    where s.order_id = p_order_id and s.released_at is null
  loop
    select oi.* into v_item from public.order_items oi
    where oi.id = v_alloc.order_item_id;
    if v_item.id is not null and v_item.pickup_datetime is not null and v_item.dropoff_datetime is not null then
      update public.surf_rack_allocations
      set vehicle_id = v_item.vehicle_id,
          starts_at  = v_item.pickup_datetime,
          ends_at    = v_item.dropoff_datetime
      where id = v_alloc.id
        and (vehicle_id is distinct from v_item.vehicle_id
          or starts_at is distinct from v_item.pickup_datetime
          or ends_at   is distinct from v_item.dropoff_datetime);
    end if;
  end loop;

  if v_status = 'cancelled' then
    update public.surf_rack_allocations
    set released_at = now(), released_reason = 'cancelled'
    where order_id = p_order_id and released_at is null;
  elsif v_status = 'completed' then
    -- Returned before the booked end: free the rack from now.
    update public.surf_rack_allocations
    set released_at = now(), released_reason = 'returned_early'
    where order_id = p_order_id and released_at is null and ends_at > now();
  end if;
end;
$$;

-- 6) Triggers.
create or replace function public.trg_surf_rack_order_addons()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.surf_rack_allocations
    set released_at = now(), released_reason = 'removed'
    where order_addon_id = old.id and released_at is null;
    return old;
  end if;
  perform public.sync_surf_rack_allocations(new.order_id);
  return new;
end;
$$;

drop trigger if exists surf_rack_order_addons_sync on public.order_addons;
create trigger surf_rack_order_addons_sync
  after insert or delete on public.order_addons
  for each row execute function public.trg_surf_rack_order_addons();

create or replace function public.trg_surf_rack_order_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_surf_rack_allocations(new.order_id);
  return new;
end;
$$;

drop trigger if exists surf_rack_order_items_sync on public.order_items;
create trigger surf_rack_order_items_sync
  after insert or update of vehicle_id, pickup_datetime, dropoff_datetime on public.order_items
  for each row execute function public.trg_surf_rack_order_items();

create or replace function public.trg_surf_rack_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.sync_surf_rack_allocations(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists surf_rack_orders_sync on public.orders;
create trigger surf_rack_orders_sync
  after update of status on public.orders
  for each row execute function public.trg_surf_rack_orders();

-- 7) Backfill current bookings so they count against stock.
select public.sync_surf_rack_allocations(o.id)
from public.orders o
where o.status in ('active', 'confirmed')
  and exists (
    select 1 from public.order_addons oa
    where oa.order_id = o.id and public.is_surf_rack_addon(oa.addon_name, oa.store_id)
  );
