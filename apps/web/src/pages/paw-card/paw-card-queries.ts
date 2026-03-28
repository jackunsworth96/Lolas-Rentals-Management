import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SAVINGS_LOGS_TABLE,
  normalizeEmail,
  firstNameLastInitial,
  startOfCurrentMonthIso,
  type SavingsRow,
} from './paw-card-utils.js';

export type LeaderboardPeriod = 'month' | 'all';

/** Rental orders linked to customers whose email matches the signed-in user. */
export async function fetchRentalOrdersForEmail(sb: SupabaseClient, email: string) {
  const e = normalizeEmail(email);
  if (!e) return [];

  const { data: custRows, error: cErr } = await sb
    .from('customers')
    .select('id')
    .ilike('email', e)
    .limit(10);
  if (cErr) throw cErr;

  const customerIds = [...new Set((custRows ?? []).map((c: { id: string }) => c.id).filter(Boolean))];
  if (customerIds.length === 0) return [];

  const { data: orders, error: oErr } = await sb
    .from('orders')
    .select('id, order_date, status')
    .in('customer_id', customerIds)
    .order('order_date', { ascending: false })
    .limit(30);
  if (oErr) throw oErr;
  return (orders ?? []) as { id: string; order_date: string; status: string }[];
}

export async function fetchEstablishments(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('paw_card_establishments')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as { id: number; name: string }[];
}

export async function fetchSavingsRows(sb: SupabaseClient, period: LeaderboardPeriod): Promise<SavingsRow[]> {
  let q = sb.from(SAVINGS_LOGS_TABLE).select('*');
  if (period === 'month') {
    q = q.gte('created_at', startOfCurrentMonthIso());
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SavingsRow[];
}

export function sumAmountSaved(rows: SavingsRow[]): number {
  return rows.reduce((s, r) => s + Number(r.amount_saved ?? 0), 0);
}

export function rowsForUser(rows: SavingsRow[], userEmail: string): SavingsRow[] {
  const key = normalizeEmail(userEmail);
  return rows.filter((r) => r.email && normalizeEmail(r.email) === key);
}

export type LeaderboardEntryAgg = {
  key: string;
  displayName: string;
  totalSaved: number;
};

export function aggregateLeaderboard(rows: SavingsRow[]): LeaderboardEntryAgg[] {
  const map = new Map<string, { name: string; saved: number }>();
  for (const r of rows) {
    const key = normalizeEmail(r.email ?? '') || normalizeEmail(r.full_name ?? '');
    if (!key) continue;
    const label = (r.full_name?.trim() || r.email || key).trim();
    const cur = map.get(key);
    const add = Number(r.amount_saved ?? 0);
    if (cur) cur.saved += add;
    else map.set(key, { name: label, saved: add });
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      displayName: firstNameLastInitial(v.name),
      totalSaved: Math.round(v.saved * 100) / 100,
    }))
    .sort((a, b) => b.totalSaved - a.totalSaved);
}

export function recentForUser(rows: SavingsRow[], userEmail: string, limit: number): SavingsRow[] {
  const mine = rowsForUser(rows, userEmail);
  return [...mine].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
}
