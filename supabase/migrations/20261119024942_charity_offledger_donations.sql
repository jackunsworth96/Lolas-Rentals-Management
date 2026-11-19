-- Donations handed over outside the ledger (before tracking existed, or never
-- entered as a charity payout). These count towards the NGO impact figures
-- only; they never create journal entries, so account balances are unaffected.

create table if not exists public.charity_offledger_donations (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  recipient   text not null,
  ngo_id      uuid references public.ngos(id) on delete set null,
  amount      numeric(12,2) not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.charity_offledger_donations enable row level security;

create policy "charity_offledger_donations_service_all" on public.charity_offledger_donations
  for all using (auth.role() = 'service_role');

-- The ₱25,000 Be Pawsitive fun run donation was previously folded into the
-- hardcoded opening balance (307,995 → 282,995 in the API alongside this).
insert into public.charity_offledger_donations (date, recipient, ngo_id, amount, note)
values
  ('2026-05-15', 'Be Pawsitive', (select id from public.ngos where slug = 'be-pawsitive'), 25000,
   'Fun run donation, May 2026 (exact day not recorded)'),
  ('2026-06-15', 'Eco Hub Siargao', (select id from public.ngos where slug = 'eco-hub-siargao'), 14500,
   '2026 donation (exact date not recorded)'),
  ('2026-06-15', 'New Uba School', null, 6000,
   'June 2026 (exact day not recorded)');
