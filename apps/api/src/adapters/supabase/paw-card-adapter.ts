import type {
  PawCardPort,
  PawCardCustomer,
  LifetimeSavings,
  PawCardEntry,
  PawCardSubmission,
  CompanyImpact,
  LeaderboardResult,
  LeaderboardEntry,
} from '@lolas/domain';
import { getSupabaseClient } from './client.js';

function privacyName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  if (!last) return first;
  return `${first} ${last[0].toUpperCase()}.`;
}

/** Lowercase + trim for case-insensitive email matching (DB may store mixed case from other apps). */
function normalizeEmailForMatch(value: string): string {
  return value.trim().toLowerCase();
}

/** Escape %, _, and \ so they are treated as literals in PostgREST ILIKE patterns. */
function escapePostgrestLike(value: string): string {
  return value.replace(/[%_\\,()]/g, '\\$&');
}

function pawCardLookupOrFilter(rawQuery: string): string {
  const raw = rawQuery.trim();
  const safe = escapePostgrestLike(raw.toLowerCase());
  const safeRaw = escapePostgrestLike(raw);
  return `email.ilike.%${safe}%,full_name.ilike.%${safe}%,order_id.eq.${safeRaw}`;
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@');
}

async function resolveEstablishmentName(
  sb: ReturnType<typeof getSupabaseClient>,
  establishmentId: string,
): Promise<string> {
  const idNum = Number(establishmentId);
  if (!Number.isNaN(idNum) && establishmentId.trim() !== '') {
    const { data, error } = await sb
      .from('paw_card_establishments')
      .select('name')
      .eq('id', idNum)
      .maybeSingle();
    if (!error && data?.name) return data.name as string;
  }
  return establishmentId;
}

/** Match rows stored as either numeric id (legacy) or display name. */
async function establishmentColumnValuesForFilter(
  sb: ReturnType<typeof getSupabaseClient>,
  establishmentId: string,
): Promise<string[]> {
  const out = new Set<string>();
  out.add(establishmentId);
  const name = await resolveEstablishmentName(sb, establishmentId);
  if (name !== establishmentId) out.add(name);
  return [...out];
}

export class SupabasePawCardAdapter implements PawCardPort {
  async lookupCustomer(query: string): Promise<PawCardCustomer[]> {
    const sb = getSupabaseClient();
    const raw = query.trim();
    const qLower = raw.toLowerCase();

    const { data: entryRows, error: entryErr } = await sb
      .from('paw_card_entries')
      .select('*')
      .or(pawCardLookupOrFilter(raw));

    if (entryErr) throw new Error(`lookupCustomer entries failed: ${entryErr.message}`);

    const byEmail = new Map<string, { name: string; email: string | null; mobile: string | null; visits: number; saved: number }>();
    for (const row of entryRows ?? []) {
      const key = (row.email || row.full_name || '').toLowerCase();
      const existing = byEmail.get(key);
      if (existing) {
        existing.visits += 1;
        existing.saved += Number(row.amount_saved ?? 0);
      } else {
        byEmail.set(key, {
          name: row.full_name,
          email: row.email,
          mobile: null,
          visits: 1,
          saved: Number(row.amount_saved ?? 0),
        });
      }
    }

    const safeLower = escapePostgrestLike(qLower);
    const { data: custRows, error: custErr } = await sb
      .from('customers')
      .select('id, name, email, mobile')
      .or(`email.ilike.%${safeLower}%,mobile.ilike.%${safeLower}%,name.ilike.%${safeLower}%`);

    if (!custErr) {
      for (const c of custRows ?? []) {
        const key = (c.email || c.name || '').toLowerCase();
        if (!byEmail.has(key)) {
          byEmail.set(key, {
            name: c.name,
            email: c.email,
            mobile: c.mobile,
            visits: 0,
            saved: 0,
          });
        } else {
          const existing = byEmail.get(key)!;
          if (!existing.mobile && c.mobile) existing.mobile = c.mobile;
        }
      }
    }

    return Array.from(byEmail.entries()).map(([key, v]) => ({
      id: key,
      name: v.name,
      email: v.email,
      mobile: v.mobile,
      orderId: null,
      totalVisits: v.visits,
      lifetimeSavings: v.saved,
    }));
  }

  async getEstablishments(
    _storeId: string,
  ): Promise<Array<{ id: string; name: string; category: string }>> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('paw_card_establishments')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (error) throw new Error(`getEstablishments failed: ${error.message}`);

    return (data ?? []).map((r: { id: number; name: string }) => ({
      id: String(r.id),
      name: r.name,
      category: 'general',
    }));
  }

  async getLifetimeSavings(customerId: string): Promise<LifetimeSavings> {
    const sb = getSupabaseClient();
    const idNorm = normalizeEmailForMatch(customerId);
    const safeId = escapePostgrestLike(idNorm);

    const { data, error } = await sb
      .from('paw_card_entries')
      .select('amount_saved')
      .or(`email.ilike.%${safeId}%,full_name.ilike.%${safeId}%`);

    if (error) throw new Error(`getLifetimeSavings failed: ${error.message}`);

    const rows = data ?? [];
    const totalSaved = rows.reduce(
      (sum: number, r: { amount_saved: number }) => sum + Number(r.amount_saved ?? 0),
      0,
    );

    return {
      customerId: idNorm,
      totalSaved,
      totalVisits: rows.length,
      averageSavingsPerVisit: rows.length > 0 ? Math.round((totalSaved / rows.length) * 100) / 100 : 0,
    };
  }

  async submitEntry(entry: PawCardSubmission): Promise<PawCardEntry> {
    const sb = getSupabaseClient();
    const emailRaw = entry.email?.trim();
    const email =
      emailRaw && emailRaw.length > 0
        ? normalizeEmailForMatch(emailRaw)
        : looksLikeEmail(entry.customerId)
          ? normalizeEmailForMatch(entry.customerId)
          : null;
    const cid = entry.customerId.trim();
    const fullNameInput = entry.fullName?.trim();
    const displayName = fullNameInput
      ? fullNameInput
      : !looksLikeEmail(cid)
        ? cid || 'Guest'
        : (email?.split('@')[0] ?? 'Guest');
    const orderId = entry.orderId?.trim() || null;
    const establishmentLabel = await resolveEstablishmentName(sb, entry.establishmentId);
    const n = entry.numberOfPeople;
    const numberOfPeople =
      typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;

    const pawRef = `PAW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const { data, error } = await sb
      .from('paw_card_entries')
      .insert({
        full_name: displayName,
        email,
        order_id: orderId,
        paw_reference: pawRef,
        establishment: establishmentLabel,
        amount_saved: entry.discountAmount,
        date_of_visit: entry.visitDate,
        number_of_people: numberOfPeople,
        receipt_url: entry.receiptUrl ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`submitEntry failed: ${error.message}`);

    return {
      id: String(data.id),
      customerId: entry.customerId,
      establishmentId: entry.establishmentId,
      establishmentName: establishmentLabel,
      discountAmount: Number(data.amount_saved),
      visitDate: data.date_of_visit,
      submittedBy: entry.submittedBy,
      storeId: entry.storeId,
      receiptUrl: data.receipt_url ?? null,
      createdAt: new Date(data.created_at),
    };
  }

  async getCompanyImpact(establishmentId: string): Promise<CompanyImpact> {
    const sb = getSupabaseClient();
    let query = sb.from('paw_card_entries').select('*');

    if (establishmentId !== 'all') {
      const variants = await establishmentColumnValuesForFilter(sb, establishmentId);
      query = query.in('establishment', variants);
    }

    const { data, error } = await query;
    if (error) throw new Error(`getCompanyImpact failed: ${error.message}`);

    const rows = data ?? [];
    const uniqueEmails = new Set(rows.map((r: { email: string | null }) => r.email).filter(Boolean));
    const totalDiscount = rows.reduce(
      (sum: number, r: { amount_saved: number }) => sum + Number(r.amount_saved ?? 0),
      0,
    );

    const filteredLabel =
      establishmentId === 'all'
        ? 'All Establishments'
        : (await resolveEstablishmentName(sb, establishmentId)) || (rows[0]?.establishment ?? establishmentId);

    return {
      establishmentId,
      establishmentName: filteredLabel,
      totalEntries: rows.length,
      totalDiscountGiven: totalDiscount,
      uniqueCustomers: uniqueEmails.size,
    };
  }

  async getMySubmissions(employeeId: string): Promise<PawCardEntry[]> {
    const sb = getSupabaseClient();
    const idNorm = normalizeEmailForMatch(employeeId);
    const safeId = escapePostgrestLike(idNorm);
    const { data, error } = await sb
      .from('paw_card_entries')
      .select('*')
      .or(`email.ilike.%${safeId}%,full_name.ilike.%${safeId}%`)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`getMySubmissions failed: ${error.message}`);

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      customerId: String(r.email ?? r.full_name ?? ''),
      establishmentId: String(r.establishment ?? ''),
      establishmentName: String(r.establishment ?? ''),
      discountAmount: Number(r.amount_saved ?? 0),
      visitDate: String(r.date_of_visit ?? ''),
      submittedBy: 'public',
      storeId: 'default',
      receiptUrl: (r.receipt_url as string) ?? null,
      createdAt: new Date(String(r.created_at)),
    }));
  }

  async getLeaderboard(email?: string): Promise<LeaderboardResult> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('paw_card_entries')
      .select('full_name, email, amount_saved');

    if (error) throw new Error(`getLeaderboard failed: ${error.message}`);

    const agg = new Map<string, { name: string; saved: number }>();
    for (const row of data ?? []) {
      const key = (row.email || row.full_name || '').toLowerCase();
      const existing = agg.get(key);
      if (existing) {
        existing.saved += Number(row.amount_saved ?? 0);
      } else {
        agg.set(key, { name: row.full_name ?? key, saved: Number(row.amount_saved ?? 0) });
      }
    }

    const sorted = Array.from(agg.entries())
      .sort((a, b) => b[1].saved - a[1].saved);

    const emailLower = email?.toLowerCase();

    const top: LeaderboardEntry[] = sorted.slice(0, 10).map(([key, v], i) => ({
      rank: i + 1,
      name: privacyName(v.name),
      totalSaved: Math.round(v.saved * 100) / 100,
      isCurrentUser: !!emailLower && key === emailLower,
    }));

    let myPosition: LeaderboardEntry | null = null;
    if (emailLower) {
      const idx = sorted.findIndex(([key]) => key === emailLower);
      if (idx >= 0) {
        const [, v] = sorted[idx];
        myPosition = {
          rank: idx + 1,
          name: privacyName(v.name),
          totalSaved: Math.round(v.saved * 100) / 100,
          isCurrentUser: true,
        };
      }
    }

    return { top, myPosition };
  }

  async registerCustomer(data: { name: string; email: string; mobile?: string; orderId?: string }): Promise<PawCardCustomer> {
    const sb = getSupabaseClient();
    const emailNorm = normalizeEmailForMatch(data.email);

    const { data: existing } = await sb
      .from('customers')
      .select('id, name, email, mobile')
      .ilike('email', emailNorm)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const savings = await this.getLifetimeSavings(emailNorm);
      return {
        id: existing.email ? normalizeEmailForMatch(existing.email) : existing.id,
        name: existing.name,
        email: existing.email ? normalizeEmailForMatch(existing.email) : existing.email,
        mobile: existing.mobile,
        orderId: data.orderId?.trim() || null,
        totalVisits: savings.totalVisits,
        lifetimeSavings: savings.totalSaved,
      };
    }

    let storeId: string | null = null;
    if (data.orderId) {
      const { data: order } = await sb
        .from('orders')
        .select('store_id')
        .eq('id', data.orderId)
        .maybeSingle();
      if (order) storeId = order.store_id;
    }

    const id = `paw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await sb.from('customers').insert({
      id,
      store_id: storeId,
      name: data.name,
      email: emailNorm,
      mobile: data.mobile ?? null,
    });

    if (error) throw new Error(`registerCustomer failed: ${error.message}`);

    return {
      id: emailNorm,
      name: data.name,
      email: emailNorm,
      mobile: data.mobile ?? null,
      orderId: data.orderId?.trim() || null,
      totalVisits: 0,
      lifetimeSavings: 0,
    };
  }
}

export function createPawCardAdapter(): PawCardPort {
  return new SupabasePawCardAdapter();
}
