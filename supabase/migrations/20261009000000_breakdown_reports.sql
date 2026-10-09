-- Migration: Breakdown Reports
-- Creates the breakdown_reports table for recording non-accident vehicle
-- issues that occur during a customer's rental (flat tyre, flat battery,
-- mechanical/electrical fault, etc). Distinct from accident_reports (no
-- injury/police/legal angle) and from maintenance (which is not tied to a
-- specific order/customer). Always linked to an order so quarterly
-- "% of customers affected" stats can be computed reliably.

create table if not exists public.breakdown_reports (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 text not null references public.stores(id),
  order_id                 text not null references public.orders(id),
  vehicle_id               text not null references public.fleet(id),
  customer_id              text references public.customers(id),

  -- When / where
  breakdown_at             timestamptz not null,
  location                 text,

  -- What happened
  issue_type               text not null
                             check (issue_type in ('flat_tyre', 'flat_battery', 'engine_mechanical', 'electrical', 'other')),
  issue_detail             text, -- free text; expected when issue_type = 'other'
  description              text not null,

  -- Resolution lifecycle
  status                   text not null default 'open'
                             check (status in ('open', 'resolved')),
  resolution_type          text
                             check (resolution_type in ('roadside_fix', 'vehicle_swap', 'towed', 'customer_continued', 'other')),
  resolution_notes         text,
  resolved_at              timestamptz, -- paired with breakdown_at to compute resolution time

  -- Evidence (optional)
  photo_urls               text[] not null default '{}',
  additional_notes         text,

  -- Staff who logged / resolved the report
  reported_by_employee_id  text references public.employees(id),
  resolved_by_employee_id  text references public.employees(id),

  created_at               timestamptz not null default now(),

  constraint breakdown_reports_resolution_requires_resolved_at
    check (status = 'open' or resolved_at is not null)
);

-- Indexes for common access patterns
create index if not exists breakdown_reports_vehicle_id_idx     on public.breakdown_reports (vehicle_id);
create index if not exists breakdown_reports_order_id_idx       on public.breakdown_reports (order_id);
create index if not exists breakdown_reports_store_id_idx       on public.breakdown_reports (store_id);
create index if not exists breakdown_reports_breakdown_at_idx   on public.breakdown_reports (breakdown_at desc);
create index if not exists breakdown_reports_status_idx         on public.breakdown_reports (status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.breakdown_reports enable row level security;

create policy breakdown_reports_select on public.breakdown_reports
  for select using (
    store_id = any (public.user_store_ids())
    and public.has_permission('can_view_fleet')
  );

create policy breakdown_reports_insert on public.breakdown_reports
  for insert with check (
    store_id = any (public.user_store_ids())
    and public.has_permission('can_edit_fleet')
  );

create policy breakdown_reports_update on public.breakdown_reports
  for update using (
    store_id = any (public.user_store_ids())
    and public.has_permission('can_edit_fleet')
  )
  with check (
    store_id = any (public.user_store_ids())
    and public.has_permission('can_edit_fleet')
  );

-- ── Storage bucket for breakdown photos ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'breakdown-photos',
  'breakdown-photos',
  false,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "Staff can upload breakdown photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'breakdown-photos');

create policy "Staff can read breakdown photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'breakdown-photos');
