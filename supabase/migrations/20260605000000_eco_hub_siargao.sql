-- Migration: Eco Hub Siargao NGO + article seed
-- Adds Eco Hub Siargao to the ngos table, seeds a published article,
-- and records the ₱17,500 direct donation in orders_raw.

-- ── 1. Seed NGO ───────────────────────────────────────────────────────────────
insert into public.ngos (slug, name, description, logo_url, website_url, is_active)
values (
  'eco-hub-siargao',
  'Eco Hub Siargao',
  'Bi-weekly beach clean-ups, kids waste-awareness programs, and a single-use plastic-free initiative across Siargao Island.',
  'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/Logo_jgllkl.png',
  'https://www.instagram.com/ecohubsiargao',
  true
)
on conflict (slug) do nothing;

-- ── 2. Record ₱17,500 direct donation in orders_raw ──────────────────────────
-- Logged as a processed direct-donation row so the live /ngo-totals endpoint
-- sums it automatically via charity_donation + ngo_id.
insert into public.orders_raw (
  source,
  payload,
  status,
  charity_donation,
  ngo_id,
  created_at
)
select
  'lolas',
  '{"type":"direct_donation","note":"Lolas Rentals direct donation to Eco Hub Siargao"}'::jsonb,
  'processed',
  17500,
  (select id from public.ngos where slug = 'eco-hub-siargao'),
  now()
where not exists (
  select 1 from public.orders_raw
  where ngo_id = (select id from public.ngos where slug = 'eco-hub-siargao')
    and charity_donation = 17500
    and status = 'processed'
);

-- ── 3. Seed article ───────────────────────────────────────────────────────────
insert into public.ngo_articles (
  slug,
  title,
  excerpt,
  body_markdown,
  category,
  ngo_id,
  featured_image_url,
  meta_description,
  tags,
  published_at
)
select
  'supporting-eco-hub-siargao',
  'How We Support Eco Hub Siargao — Beach Clean-Ups, Kids Programs & a Plastic-Free Future',
  'From funding bi-weekly beach clean-ups that have removed over 4 tonnes of waste from Siargao''s coastlines, to co-sponsoring a kids environmental awareness program in Libertad — here''s how Lola''s Rentals backs Eco Hub Siargao.',
  $body$# How We Support Eco Hub Siargao

Siargao is one of the most beautiful islands in the Philippines. Keeping it that way takes real, consistent community action — and that's exactly what Eco Hub Siargao does.

Since partnering with Eco Hub, Lola's Rentals has been funding their bi-weekly beach and coastal clean-ups across the island. We're now proud to go further by co-sponsoring their Kids Environmental Awareness Program — bringing sustainable living education directly into Siargao's communities.

## About Eco Hub Siargao

Eco Hub Siargao is a grassroots environmental organisation running structured clean-ups, educational programs for children, and a plastic-free business initiative across the island. Their work is hands-on, community-driven, and built for long-term impact.

> "Through consistent community action, we have diverted an estimated 4 tonnes of waste from the environment, with more than 57% of collected materials recovered for recycling."
> — Eco Hub Siargao

## The Beach Clean-Up Programme

Since launching their clean-up programme, Eco Hub has organised **29 bi-weekly events** across Siargao's beaches and coastal ecosystems. These aren't one-off efforts — they are consistent, structured clean-ups that bring together residents, tourists, and local children.

### Impact so far (2025–2026)

- **520 volunteers** engaged — residents, tourists, and local kids
- **715 bags of waste** collected
- **~4,008 kg** of waste removed from Siargao's beaches and coastal ecosystems
- **More than 57%** of collected materials recovered for recycling

### Waste breakdown

| Type | Weight |
|------|--------|
| ♻️ Recyclables recovered | 2,293 kg |
| 🍾 Glass collected | 1,051 kg |
| 🗑️ Non-recyclable waste removed | 664 kg |

## How Lola's Has Supported the Clean-Ups

Every booking made with Lola's Rentals contributes a portion to our NGO partners. Eco Hub Siargao became part of that family in 2025, and to date Lola's has donated **₱17,500** directly to fund their clean-up operations — covering logistics, equipment, and volunteer coordination.

## The Kids Environmental Awareness Program

In 2026, Eco Hub launched their first Kids Awareness Program in Libertad, the main town of General Luna. Approximately **30 children aged 4–15** participated in **5 sessions** covering:

- The impact of littering
- Why burning waste is harmful
- Upcycling and creative reuse
- Reducing everyday waste
- Building sustainable habits

Local teachers are already integrating the curriculum into their regular classroom sessions — meaning the programme lives on long after the events.

**Lola's Rentals is now co-funding this programme**, helping Eco Hub expand it to remote villages across the island. Two new Kids Awareness Programs are planned for 2026 in areas that have never had access to this kind of education before.

## What's Coming Next

Over the next 7 months, Eco Hub has an ambitious programme:

- **14 more beach clean-ups** across the island
- **2 kids awareness programs** in remote villages (3 were completed this year)
- **Launch of a single-use plastic-free project** — working directly with restaurants, cafes, and bars to eliminate single-use plastics from their operations
- **Monthly awareness videos** and sustainable lifestyle content to empower the local community
- **Spotlighting 14 eco-conscious businesses** across Siargao, motivating others to follow suit

## Why It Matters

Tourism and the environment are inseparable on Siargao. The island's appeal — its beaches, its reefs, its natural beauty — depends on the people who live and visit here caring for it. Eco Hub Siargao is building that culture from the ground up: through clean-ups, through education, and through business-by-business change.

Lola's Rentals is proud to be part of that effort.

Follow Eco Hub Siargao on Instagram to see the work in action and find out how you can get involved the next time you're on the island.
$body$,
  'ngo',
  (select id from public.ngos where slug = 'eco-hub-siargao'),
  'https://res.cloudinary.com/dk3c78pro/image/upload/v1780626103/Logo_jgllkl.png',
  'Learn how Lola''s Rentals supports Eco Hub Siargao — funding beach clean-ups that have removed 4 tonnes of waste and co-sponsoring a kids environmental awareness program.',
  array['siargao', 'environment', 'beach clean-up', 'eco hub', 'kids program', 'sustainability', 'ngo'],
  now()
where not exists (
  select 1 from public.ngo_articles where slug = 'supporting-eco-hub-siargao'
);
