-- Contracts: reusable markdown templates with {{placeholders}}, and contracts
-- created from them. A contract's rendered_body is frozen when it is sent and
-- body_sha256 proves what was signed. Both Lola's and the recipient sign.

-- 1) Templates. Editing a template bumps version; sent contracts keep their copy.
create table if not exists public.contract_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text not null check (category in ('accommodation_partner', 'paw_card_partner', 'staff', 'other')),
  description    text,
  body_markdown  text not null default '',
  placeholders   jsonb not null default '[]'::jsonb,
  version        integer not null default 1 check (version > 0),
  is_active      boolean not null default true,
  created_by     text references public.employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists contract_templates_category_idx on public.contract_templates (category, is_active);

-- 2) Contracts.
create table if not exists public.contracts (
  id                     uuid primary key default gen_random_uuid(),
  template_id            uuid references public.contract_templates(id) on delete set null,
  template_version       integer,
  title                  text not null,
  category               text not null check (category in ('accommodation_partner', 'paw_card_partner', 'staff', 'other')),
  counterparty_type      text not null default 'external'
                           check (counterparty_type in ('accommodation_partner', 'paw_card_establishment', 'employee', 'external')),
  counterparty_id        text,
  recipient_name         text not null,
  recipient_email        text,
  "values"               jsonb not null default '{}'::jsonb,
  rendered_body          text not null default '',
  body_sha256            text,
  status                 text not null default 'draft'
                           check (status in ('draft', 'sent', 'viewed', 'completed', 'voided', 'expired')),
  access_token_hash      text unique,
  token_expires_at       timestamptz,
  sent_at                timestamptz,
  viewed_at              timestamptz,
  lola_signer_user_id    uuid references public.users(id) on delete set null,
  lola_signer_name       text,
  lola_signer_title      text,
  lola_signature_path    text,
  lola_signed_at         timestamptz,
  signer_name            text,
  signer_signature_path  text,
  signer_ip              text,
  signer_user_agent      text,
  signed_at              timestamptz,
  pdf_path               text,
  voided_at              timestamptz,
  void_reason            text,
  created_by             text references public.employees(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists contracts_created_at_idx on public.contracts (created_at desc);
create index if not exists contracts_counterparty_idx on public.contracts (counterparty_type, counterparty_id);
create index if not exists contracts_status_idx on public.contracts (status);

-- 3) Audit trail.
create table if not exists public.contract_events (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  event        text not null check (event in ('created', 'updated', 'sent', 'resent', 'viewed', 'signed', 'voided', 'emailed')),
  actor        text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists contract_events_contract_idx on public.contract_events (contract_id, created_at);

-- RLS: the API uses the service role; direct reads are limited to permitted staff.
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_events enable row level security;

create policy contract_templates_select on public.contract_templates
  for select using (public.has_permission('can_manage_contracts') or public.has_permission('can_manage_staff_contracts'));
create policy contracts_select on public.contracts
  for select using (
    (category <> 'staff' and public.has_permission('can_manage_contracts'))
    or (category = 'staff' and public.has_permission('can_manage_staff_contracts'))
  );
create policy contract_events_select on public.contract_events
  for select using (exists (
    select 1 from public.contracts c
    where c.id = contract_id
      and ((c.category <> 'staff' and public.has_permission('can_manage_contracts'))
        or (c.category = 'staff' and public.has_permission('can_manage_staff_contracts')))
  ));

-- 4) Private bucket for signature images and signed PDFs (service role only).
insert into storage.buckets (id, name, public)
values ('contract-documents', 'contract-documents', false)
on conflict (id) do nothing;

-- 5) Permissions.
insert into role_permissions (role_id, permission)
select distinct rp.role_id, 'can_manage_contracts'
from role_permissions rp
where rp.permission = 'can_edit_settings'
on conflict do nothing;

insert into role_permissions (role_id, permission)
select distinct rp.role_id, 'can_manage_staff_contracts'
from role_permissions rp
where rp.permission = 'can_manage_employees'
on conflict do nothing;

notify pgrst, 'reload schema';
