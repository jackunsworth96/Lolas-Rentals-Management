import { HANDOVER_MS } from './availability-finder.js';
import { blockingPartners, poolCounts } from './partner-protection.js';

export interface AllocationConflictDetails {
  reason: 'partner_protected' | 'fully_committed' | 'model_full' | 'vehicle_unavailable' | 'other';
  storeId?: string;
  vehicleType?: string;
  at?: string;
  startsAt?: string;
  endsAt?: string;
  partners?: Array<{ partnerId: string; partnerName: string }>;
}

const TYPE_LABEL: Record<string, string> = { bike: 'bike', tuktuk: 'TukTuk' };

function parseDbTimestamp(value: string): number {
  const normalised = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  return Date.parse(normalised);
}

const manilaDay = (t: number) => new Date(t).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' });

interface RequestLike {
  body?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  user?: { storeIds?: string[] };
}

/**
 * Turn the database's ALLOCATION_CONFLICT text into something staff can act
 * on: whose allocation is in the way and on which dates.
 */
export async function explainAllocationConflict(raw: string, req: RequestLike): Promise<{ message: string; details: AllocationConflictDetails }> {
  if (raw.includes('selected vehicle is unavailable')) {
    return { message: 'That vehicle is unavailable for these dates (maintenance, owner use or another booking). Choose another vehicle.', details: { reason: 'vehicle_unavailable' } };
  }
  if (raw.includes('is free for the whole rental')) {
    return { message: 'No vehicle of this model is free for the whole rental. Use Find availability on the Fleet page to see when one is.', details: { reason: 'model_full' } };
  }
  const match = /ALLOCATION_CONFLICT:\s*(\w+) at (.+?), booking (\w+):(\S+)/.exec(raw);
  if (!match) {
    return { message: raw.replace(/^.*ALLOCATION_CONFLICT:\s*/, '').replace(/^\w/, (c) => c.toUpperCase()), details: { reason: 'other' } };
  }
  const [, vehicleType, atText, sourceKind, sourceId] = match;
  const at = parseDbTimestamp(atText);
  const typeLabel = TYPE_LABEL[vehicleType] ?? vehicleType;

  const { getSupabaseClient } = await import('../adapters/supabase/client.js');
  const { loadProtectionData, resolvePartnerRef } = await import('../use-cases/fleet/protection-inputs.js');
  const sb = getSupabaseClient();
  const source = await loadSource(sb, sourceKind, sourceId);
  const body = req.body ?? {};
  const storeId = (typeof body.storeId === 'string' ? body.storeId : null) ?? source?.storeId ?? req.user?.storeIds?.find((s) => s !== 'company');
  const startsMs = Date.parse(String(body.pickupDatetime ?? '')) || source?.startsMs || at;
  const endsMs = Date.parse(String(body.dropoffDatetime ?? '')) || source?.endsMs || at + HANDOVER_MS;
  const partnerRef = (typeof body.partnerRef === 'string' ? body.partnerRef : null) ?? source?.partnerRef ?? null;
  if (!storeId || !Number.isFinite(at)) {
    return { message: `No ${typeLabel} is free for part of this booking. Choose other dates or another vehicle.`, details: { reason: 'fully_committed', vehicleType } };
  }

  const protection = await loadProtectionData(sb, storeId, Math.min(startsMs, at), Math.max(endsMs + HANDOVER_MS, at + 1));
  const partnerId = await resolvePartnerRef(sb, storeId, partnerRef);
  const partners = blockingPartners(protection, vehicleType, partnerId, Math.min(startsMs, at), Math.max(endsMs + HANDOVER_MS, at + 1))
    .map((p) => ({ partnerId: p.partnerId, partnerName: p.partnerName }));
  const base = { storeId, vehicleType, at: new Date(at).toISOString(), startsAt: new Date(startsMs).toISOString(), endsAt: new Date(endsMs).toISOString() };
  const { sharedFree } = poolCounts(protection, vehicleType, null, at);

  if (partners.length > 0 && sharedFree <= 0) {
    const names = partners.map((p) => p.partnerName).join(' and ');
    const n = partners.length === 1 ? 'the' : 'a';
    return {
      message: `This would use ${n} ${typeLabel} protected for ${names} on ${manilaDay(at)}. `
        + 'Choose another vehicle or other dates. Only a Manager or Admin can release a protected unit for this booking.',
      details: { reason: 'partner_protected', ...base, partners },
    };
  }
  return {
    message: `Every ${typeLabel} is already committed on ${manilaDay(at)}. Choose other dates, or check Find availability on the Fleet page.`,
    details: { reason: 'fully_committed', ...base },
  };
}

async function loadSource(
  sb: import('@supabase/supabase-js').SupabaseClient,
  kind: string,
  id: string,
): Promise<{ storeId: string; startsMs: number; endsMs: number; partnerRef: string | null } | null> {
  const table = kind === 'raw' ? 'orders_raw' : kind === 'item' ? 'order_items' : kind === 'hold' ? 'booking_holds' : null;
  if (!table) return null;
  const select = kind === 'raw' ? 'store_id, pickup_datetime, dropoff_datetime, partner_ref' : 'store_id, pickup_datetime, dropoff_datetime';
  const { data } = await sb.from(table).select(select).eq('id', id).maybeSingle();
  const row = data as { store_id: string; pickup_datetime: string; dropoff_datetime: string; partner_ref?: string | null } | null;
  if (!row?.store_id) return null;
  return { storeId: row.store_id, startsMs: Date.parse(row.pickup_datetime), endsMs: Date.parse(row.dropoff_datetime), partnerRef: row.partner_ref ?? null };
}
