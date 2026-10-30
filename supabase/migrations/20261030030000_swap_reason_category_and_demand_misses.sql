-- 1) Structured reason on vehicle swaps.
-- Before breakdown_reports existed (Oct 2026), a mid-rental vehicle fault was only
-- recorded as free text on a swap. A category lets the Customer Confidence report
-- count 'vehicle_fault' swaps as customer-affecting issues alongside breakdowns
-- and accidents, without parsing free text.
alter table public.vehicle_swaps
  add column if not exists reason_category text
    check (reason_category in ('vehicle_fault', 'damage', 'customer_request', 'admin_correction', 'other'));

update public.vehicle_swaps set reason_category = 'vehicle_fault' where id in (
  'b36f8ecf-e025-4a09-8183-1da86f59b2d7', -- lack of air pressure
  'f20229e4-1ff9-4560-8604-33b7ed04f748', -- battery drained
  '050182bf-4e3d-4793-bead-f4e86faa2b2a', -- tyre crack
  '772c0180-aac3-40ca-83c5-9fd1f399451c', -- turns off when idle
  'ee2ea28b-d525-4f78-9836-85086f1bb625', -- front brake stuck
  '4ade0321-7a64-47c2-a5d3-13439f0cf7d4', -- throttle delay
  'af75c755-e12f-4529-a3ef-35bd44379dc4', -- ball race
  '32b205f6-e9a3-472a-a631-9c626b58e190', -- starter button
  '9a8fa42b-b2d3-43a2-bb13-67011e32e006', -- not working
  '0dde75d0-7262-4881-af74-eede77e696eb', -- swap for towed breakdown (sand in disc brake)
  '17529500-1cc6-443d-b17d-4b50cd4dea6e'  -- bike always stops
);

update public.vehicle_swaps set reason_category = 'damage' where id in (
  '1c9ca32a-ff7e-4c88-80cd-c09e3a56b66b', -- broken mirror
  '26cf4359-30fa-46a6-aa07-135bd824bdb0', -- broken crashguard
  'c5596fe4-8d65-46ad-8960-5a51feefb54b'  -- broken surf rack holder
);

update public.vehicle_swaps set reason_category = 'customer_request' where id in (
  'd6698b55-d9f0-404f-8af6-908ce589f0a8',
  '43e2f8f8-9122-4017-af10-46d030cc5511',
  '564a0fc3-d3e5-4be5-b3b9-f84c67f16dad'  -- lost key
);

update public.vehicle_swaps set reason_category = 'admin_correction' where id in (
  'd960fdcc-16fb-4230-9c3d-dec1609d6e58',
  'afab65e1-d155-4277-8991-306b5d991219',
  'b33138d1-f9fe-421a-82b3-9335e66caf37',
  'd6b2cc73-4bf9-4cf0-9272-a515fcde8d97',
  '265707d2-c60d-4582-8f84-9c4b54518568',
  '2f00b798-23fc-4e69-9173-5be91612a9ba',
  'ebfb56a2-d215-44b5-a96b-086e7941170f',
  'f9e04b6b-cbb4-4d05-88da-2c69ed1c139d'
);

update public.vehicle_swaps set reason_category = 'other' where reason_category is null;

-- 2) Demand we couldn't serve, captured automatically.
-- 'website' / 'partner_portal': a date search where a model came back with zero
-- available units. 'walk_in': one tap by staff from the Fleet Availability view
-- when a walk-in customer is turned away. Replaces relying on manual
-- lost_opportunity entries.
create table if not exists public.demand_misses (
  id                uuid primary key default gen_random_uuid(),
  store_id          text not null references public.stores(id),
  vehicle_model_id  text not null,
  source            text not null check (source in ('website', 'partner_portal', 'walk_in')),
  pickup_datetime   timestamptz,
  dropoff_datetime  timestamptz,
  -- Hashed visitor fingerprint (website/partner) so repeated identical searches by
  -- the same person count once. Null for walk-ins, where every tap is a person.
  visitor_key       text,
  partner_ref       text,
  employee_id       text references public.employees(id),
  created_at        timestamptz not null default now()
);

create unique index if not exists demand_misses_dedupe_idx
  on public.demand_misses (source, store_id, vehicle_model_id, pickup_datetime, dropoff_datetime, visitor_key);
create index if not exists demand_misses_store_created_idx
  on public.demand_misses (store_id, created_at desc);

alter table public.demand_misses enable row level security;

create policy demand_misses_select on public.demand_misses
  for select using (
    store_id = any (public.user_store_ids())
    and public.has_permission('can_view_dashboard')
  );
