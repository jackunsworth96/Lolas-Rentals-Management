-- Migration: Accident Reports
-- Creates the accident_reports table for recording vehicle incidents.
-- Tamper-evidence via sha-256 hash emailed on creation (same pattern as maintenance/inspections).

create table if not exists public.accident_reports (
  id                        uuid primary key default gen_random_uuid(),
  store_id                  text not null references public.stores(id),
  order_id                  text not null references public.orders(id),
  vehicle_id                text not null references public.fleet(id),
  customer_id               text references public.customers(id),

  -- When / where
  accident_at               timestamptz not null,
  location                  text,

  -- What happened
  description               text not null,
  damage_description        text,

  -- Customer welfare
  customer_injured          boolean not null default false,
  injury_description        text,
  medical_attention         boolean not null default false,
  emergency_services_called boolean not null default false,
  police_report_filed       boolean not null default false,
  police_report_number      text,

  -- Helmet usage (free text — e.g. "Both riders wearing helmets")
  helmets_worn              text,

  -- Third-party involvement (free text)
  third_party_notes         text,

  -- Peace of Mind coverage (auto-set from order addons at creation)
  peace_of_mind_active      boolean,

  -- Evidence
  photo_urls                text[] not null default '{}',
  customer_signature_url    text,

  additional_notes          text,

  -- Staff who logged the report
  reported_by_employee_id   text references public.employees(id),

  -- Lifecycle
  status                    text not null default 'open'
                              check (status in ('open', 'closed')),

  -- Tamper-evident hash — set on creation, should never be updated
  tamper_hash               text,
  hash_emailed_at           timestamptz,

  created_at                timestamptz not null default now()
);

-- Indexes for common access patterns
create index if not exists accident_reports_vehicle_id_idx  on public.accident_reports (vehicle_id);
create index if not exists accident_reports_order_id_idx    on public.accident_reports (order_id);
create index if not exists accident_reports_store_id_idx    on public.accident_reports (store_id);
create index if not exists accident_reports_created_at_idx  on public.accident_reports (created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.accident_reports enable row level security;

-- Authenticated staff can read all reports
create policy "Staff can view accident reports"
  on public.accident_reports for select
  to authenticated
  using (true);

-- Authenticated staff can insert new reports
create policy "Staff can create accident reports"
  on public.accident_reports for insert
  to authenticated
  with check (true);

-- Only allow status updates (open → closed); field-level restriction enforced in API layer
create policy "Staff can update accident report status"
  on public.accident_reports for update
  to authenticated
  using (true)
  with check (true);

-- ── Storage bucket for accident photos ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'accident-photos',
  'accident-photos',
  false,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "Staff can upload accident photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'accident-photos');

create policy "Staff can read accident photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'accident-photos');
