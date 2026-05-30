-- Migration: NGO Portfolio Tables
-- Creates the `ngos` table, `ngo_articles` table, and adds `ngo_id` FK to `orders` / `orders_raw`.

-- ── 1. NGOs table ────────────────────────────────────────────────────────────
create table if not exists public.ngos (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  logo_url    text,
  website_url text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.ngos enable row level security;

create policy "ngos_public_read" on public.ngos
  for select using (true);

create policy "ngos_service_write" on public.ngos
  for all using (auth.role() = 'service_role');

-- Seed: Be Pawsitive
insert into public.ngos (slug, name, description, logo_url, website_url, is_active)
values (
  'be-pawsitive',
  'Be Pawsitive',
  'A Siargao-based animal welfare NGO dedicated to spay, neuter and vaccination programmes for the island''s street animals.',
  null,
  'https://www.be-pawsitive.org',
  true
)
on conflict (slug) do nothing;

-- ── 2. NGO Articles table ─────────────────────────────────────────────────────
do $$ begin
  create type public.ngo_article_category as enum ('ngo', 'automation', 'general');
exception when duplicate_object then null;
end $$;

create table if not exists public.ngo_articles (
  id                 uuid        primary key default gen_random_uuid(),
  slug               text        not null unique,
  title              text        not null,
  excerpt            text,
  body_markdown      text,
  category           public.ngo_article_category not null default 'general',
  ngo_id             uuid        references public.ngos(id) on delete set null,
  featured_image_url text,
  meta_description   text,
  tags               text[]      not null default '{}',
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.ngo_articles enable row level security;

create policy "ngo_articles_public_read" on public.ngo_articles
  for select using (published_at is not null and published_at <= now());

create policy "ngo_articles_service_all" on public.ngo_articles
  for all using (auth.role() = 'service_role');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ngo_articles_updated_at
  before update on public.ngo_articles
  for each row execute function public.set_updated_at();

-- ── 3. Add ngo_id to orders ───────────────────────────────────────────────────
alter table public.orders
  add column if not exists ngo_id uuid references public.ngos(id) on delete set null;

-- ── 4. Add ngo_id to orders_raw ───────────────────────────────────────────────
alter table public.orders_raw
  add column if not exists ngo_id uuid references public.ngos(id) on delete set null;

-- ── 5. Back-fill existing charity donation rows to Be Pawsitive ───────────────
update public.orders_raw
set ngo_id = (select id from public.ngos where slug = 'be-pawsitive')
where charity_donation > 0
  and ngo_id is null;

update public.orders
set ngo_id = (select id from public.ngos where slug = 'be-pawsitive')
where charity_donation > 0
  and ngo_id is null;

-- ── 6. Seed: Be Pawsitive article ─────────────────────────────────────────────
insert into public.ngo_articles (
  slug,
  title,
  excerpt,
  body_markdown,
  category,
  ngo_id,
  meta_description,
  tags,
  published_at
)
select
  'our-partnership-with-be-pawsitive',
  'Our Partnership with Be Pawsitive',
  'Be Pawsitive is a Siargao-based animal welfare organisation dedicated to spaying, neutering, and vaccinating street animals across the island. Every rental booked with Lola''s helps fund their life-changing work.',
  $body$# Our Partnership with Be Pawsitive

Be Pawsitive is a SEC-registered animal welfare organisation based on Siargao Island. Founded on a simple belief — that every stray animal deserves love, care, and a healthy life — the organisation runs spay, neuter, and vaccination programmes across the island.

> "Every animal spayed or neutered prevents hundreds of future strays from entering the cycle."

Since partnering with Lola's Rentals in October 2022, Be Pawsitive has become the heart of everything we do. It's why Lola herself — our rescue, now pampered pooch — is at the centre of our story. Every vehicle in our fleet is named after an animal that's been through the programme.

## What Be Pawsitive Does

### Spay & Neuter

Free surgical procedures for stray and community-owned animals across the island. This is the most impactful long-term intervention — one fixed animal prevents hundreds of future strays from entering the cycle.

### Vaccination

Core vaccines administered at outreach events in Santa Fe, Dapa, and surrounding barangays. Rabies vaccinations protect not just animals but the people of Siargao too.

### Community Outreach

Education and awareness programmes helping communities care for animals responsibly. Changing culture is just as important as the medical work.

## The Numbers

Be Pawsitive has fixed over 1,601 animals and vaccinated over 2,746 across Siargao. These aren't just numbers — each one represents a healthier, safer island.

## How Lola's Contributes

### You Rent, We Give

Every booking automatically contributes a portion directly to Be Pawsitive. No extra steps needed from you — it's built into how we operate.

### Paw Card Savings

Savings you earn at partner establishments across the island are matched peso-for-peso by Lola's as a direct donation. No admin fees, no markup. Every centavo goes straight to funding spay, neuter, and vaccination events.

### 100% Direct

Zero admin fees. Every centavo goes straight to the animals.

## The AquaFlask × Be Pawsitive Fun Run

Siargao's most exciting charity run returns for its third year. Lace up, hit the road, and run for the animals. The event offers two distances — 5km and 10km — catering to all fitness levels. With Nadine Lustre and Christophe Bariou as official ambassadors, it's become one of the most anticipated events on the island calendar.

Visit [be-pawsitive.org](https://www.be-pawsitive.org) to learn more or donate directly.
$body$,
  'ngo',
  (select id from public.ngos where slug = 'be-pawsitive'),
  'Learn about Lola''s Rentals'' partnership with Be Pawsitive, Siargao''s leading animal welfare NGO running spay, neuter and vaccination programmes.',
  array['siargao', 'animal welfare', 'be pawsitive', 'ngo', 'spay neuter'],
  now()
where not exists (
  select 1 from public.ngo_articles where slug = 'our-partnership-with-be-pawsitive'
);
