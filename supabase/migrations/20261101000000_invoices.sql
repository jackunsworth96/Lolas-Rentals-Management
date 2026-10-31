-- Customer invoices.
-- An invoice groups one or more bookings by order reference
-- (orders_raw.order_reference = orders.booking_token), so it stays valid while
-- a booking moves from the inbox to active to completed. Lines and totals are
-- a snapshot that staff can refresh from the live orders at any time.

-- 1) Company-wide seller details and numbering (single row, id = 'default').
create table if not exists public.invoice_settings (
  id                    text primary key default 'default' check (id = 'default'),
  legal_name            text not null default 'Lola''s Rentals',
  address               text,
  tin                   text,
  email                 text,
  phone                 text,
  show_logo             boolean not null default true,
  payment_instructions  text,
  footer_note           text,
  number_prefix         text not null default 'INV-',
  next_number           integer not null default 1 check (next_number > 0),
  updated_at            timestamptz not null default now()
);

insert into public.invoice_settings (id) values ('default') on conflict do nothing;

-- 2) Invoice header.
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null unique,
  store_id           text references public.stores(id),
  status             text not null default 'issued' check (status in ('issued', 'void')),
  issue_date         date not null default (now() at time zone 'Asia/Manila')::date,
  due_date           date,
  bill_to_name       text not null,
  bill_to_company    text,
  bill_to_address    text,
  bill_to_email      text,
  bill_to_tin        text,
  notes              text,
  subtotal           numeric(12,2) not null default 0,
  amount_paid        numeric(12,2) not null default 0,
  balance_due        numeric(12,2) not null default 0,
  deposit_held       numeric(12,2) not null default 0,
  created_by         text references public.employees(id),
  last_refreshed_at  timestamptz not null default now(),
  voided_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

-- 3) Orders on an invoice.
create table if not exists public.invoice_orders (
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  order_reference  text not null,
  sort_order       integer not null default 0,
  primary key (invoice_id, order_reference)
);

create index if not exists invoice_orders_reference_idx on public.invoice_orders (order_reference);

-- 4) Snapshot lines.
create table if not exists public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  order_reference  text not null,
  line_type        text not null check (line_type in (
                     'rental', 'addon', 'fee', 'transfer', 'charity', 'surcharge',
                     'return_charge', 'discount', 'adjustment', 'payment'
                   )),
  description      text not null,
  quantity         numeric(12,2) not null default 1,
  unit_price       numeric(12,2) not null default 0,
  amount           numeric(12,2) not null default 0,
  sort_order       integer not null default 0
);

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, sort_order);

alter table public.invoice_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_orders enable row level security;
alter table public.invoice_lines enable row level security;

create policy invoices_select on public.invoices
  for select using (public.has_permission('can_manage_invoices'));
create policy invoice_orders_select on public.invoice_orders
  for select using (public.has_permission('can_manage_invoices'));
create policy invoice_lines_select on public.invoice_lines
  for select using (public.has_permission('can_manage_invoices'));
create policy invoice_settings_select on public.invoice_settings
  for select using (public.has_permission('can_manage_invoices'));

-- 5) Atomic invoice numbering.
create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number integer;
begin
  update public.invoice_settings
  set next_number = next_number + 1, updated_at = now()
  where id = 'default'
  returning number_prefix, next_number - 1 into v_prefix, v_number;

  if v_number is null then
    insert into public.invoice_settings (id, next_number) values ('default', 2)
    on conflict (id) do nothing;
    v_prefix := 'INV-';
    v_number := 1;
  end if;

  return v_prefix || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to service_role;

-- 6) Permission: everyone who can edit orders can raise invoices.
insert into role_permissions (role_id, permission)
select distinct rp.role_id, 'can_manage_invoices'
from role_permissions rp
where rp.permission = 'can_edit_orders'
on conflict do nothing;

notify pgrst, 'reload schema';
