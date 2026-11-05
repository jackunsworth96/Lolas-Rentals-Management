import type { SupabaseClient } from '@supabase/supabase-js';
import { manilaDate, type ProtectionData } from '../../lib/partner-protection.js';

/** Statuses public.allocation_counts excludes from the unit count. */
const ALLOCATION_NON_RENTABLE = ['Under Maintenance', 'Maintenance', 'Inactive', 'Sold', 'Service Vehicle', 'Closed', 'Pending ORCR'];

const EMPTY: ProtectionData = {
  enabled: false, partnerNames: new Map(), baselines: [], overrides: [], units: [], unavailable: [], commitments: [],
};

/** Allocation schedule, units and live capacity commitments for [fromMs, toMs). */
export async function loadProtectionData(sb: SupabaseClient, storeId: string, fromMs: number, toMs: number): Promise<ProtectionData & { typeOfModel: Map<string, string> }> {
  const [settingsRes, typeMapRes] = await Promise.all([
    sb.from('partner_allocation_settings').select('enabled').eq('store_id', storeId).maybeSingle(),
    sb.from('partner_allocation_type_map').select('model_type, vehicle_type'),
  ]);
  if (settingsRes.error) throw new Error(`allocation settings query failed: ${settingsRes.error.message}`);
  if (typeMapRes.error) throw new Error(`allocation type map query failed: ${typeMapRes.error.message}`);
  const typeByModelType = new Map(((typeMapRes.data ?? []) as Array<{ model_type: string; vehicle_type: string }>)
    .map((r) => [r.model_type, r.vehicle_type]));

  const { data: fleetRows, error: fleetErr } = await sb.from('fleet')
    .select('id, status, model_id, vehicle_models(type, is_active)').eq('store_id', storeId);
  if (fleetErr) throw new Error(`fleet query failed: ${fleetErr.message}`);
  const typeOfModel = new Map<string, string>();
  const units: ProtectionData['units'] = [];
  type Row = { id: string; status: string; model_id: string | null; vehicle_models: { type: string | null; is_active: boolean } | Array<{ type: string | null; is_active: boolean }> | null };
  for (const row of (fleetRows ?? []) as unknown as Row[]) {
    const model = Array.isArray(row.vehicle_models) ? row.vehicle_models[0] : row.vehicle_models;
    const vehicleType = model?.type ? typeByModelType.get(model.type) : undefined;
    if (!row.model_id || !vehicleType) continue;
    typeOfModel.set(row.model_id, vehicleType);
    if (model?.is_active && !ALLOCATION_NON_RENTABLE.includes(row.status)) units.push({ vehicleId: row.id, vehicleType });
  }

  if (!settingsRes.data?.enabled) return { ...EMPTY, typeOfModel };

  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const fromMonth = `${manilaDate(fromMs).slice(0, 7)}-01`;
  const toMonth = `${manilaDate(toMs).slice(0, 7)}-01`;
  const [baseRes, overrideRes, unavailableRes, segmentRes] = await Promise.all([
    sb.from('partner_allocations').select('partner_id, vehicle_type, effective_month, scheduled_qty')
      .eq('store_id', storeId).gte('effective_month', fromMonth).lte('effective_month', toMonth),
    sb.from('partner_allocation_overrides').select('partner_id, vehicle_type, starts_on, ends_before, qty')
      .eq('store_id', storeId).is('revoked_at', null)
      .gt('ends_before', manilaDate(fromMs)).lte('starts_on', manilaDate(toMs)),
    sb.from('fleet_unavailability').select('vehicle_id, starts_at, ends_at')
      .eq('store_id', storeId).is('cancelled_at', null)
      .lt('starts_at', toIso).or(`ends_at.is.null,ends_at.gt.${fromIso}`),
    sb.from('capacity_reservation_segments')
      .select('starts_at, ends_at, pool, capacity_reservations!inner(store_id, partner_id, vehicle_type, released_at, expires_at)')
      .eq('capacity_reservations.store_id', storeId)
      .lt('starts_at', toIso).gt('ends_at', fromIso),
  ]);
  for (const res of [baseRes, overrideRes, unavailableRes, segmentRes]) {
    if (res.error) throw new Error(`allocation query failed: ${res.error.message}`);
  }

  const baselines = ((baseRes.data ?? []) as Array<{ partner_id: string; vehicle_type: string; effective_month: string; scheduled_qty: number }>)
    .map((r) => ({ partnerId: r.partner_id, vehicleType: r.vehicle_type, month: r.effective_month.slice(0, 10), qty: r.scheduled_qty }));
  const overrides = ((overrideRes.data ?? []) as Array<{ partner_id: string; vehicle_type: string; starts_on: string; ends_before: string; qty: number }>)
    .map((r) => ({ partnerId: r.partner_id, vehicleType: r.vehicle_type, startsOn: r.starts_on, endsBefore: r.ends_before, qty: r.qty }));
  const unavailable = ((unavailableRes.data ?? []) as Array<{ vehicle_id: string; starts_at: string; ends_at: string | null }>)
    .map((r) => ({ vehicleId: r.vehicle_id, start: Date.parse(r.starts_at), end: r.ends_at ? Date.parse(r.ends_at) : Number.POSITIVE_INFINITY }));

  const now = Date.now();
  type Segment = { starts_at: string; ends_at: string; pool: 'guaranteed' | 'shared'; capacity_reservations: { partner_id: string | null; vehicle_type: string; released_at: string | null; expires_at: string | null } | Array<{ partner_id: string | null; vehicle_type: string; released_at: string | null; expires_at: string | null }> };
  const commitments: ProtectionData['commitments'] = [];
  for (const s of (segmentRes.data ?? []) as unknown as Segment[]) {
    const r = Array.isArray(s.capacity_reservations) ? s.capacity_reservations[0] : s.capacity_reservations;
    if (!r) continue;
    if (r.released_at && Date.parse(r.released_at) <= now) continue;
    if (r.expires_at && Date.parse(r.expires_at) <= now) continue;
    commitments.push({ partnerId: r.partner_id, vehicleType: r.vehicle_type, pool: s.pool, start: Date.parse(s.starts_at), end: Date.parse(s.ends_at) });
  }

  const partnerIds = [...new Set([...baselines.map((b) => b.partnerId), ...overrides.map((o) => o.partnerId)])];
  const partnerNames = new Map<string, string>();
  if (partnerIds.length > 0) {
    const { data, error } = await sb.from('accommodation_partners').select('id, name').in('id', partnerIds);
    if (error) throw new Error(`partners query failed: ${error.message}`);
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) partnerNames.set(p.id, p.name);
  }

  return { enabled: true, partnerNames, baselines, overrides, units, unavailable, commitments, typeOfModel };
}

export async function resolvePartnerRef(sb: SupabaseClient, storeId: string, ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  const { data, error } = await sb.from('accommodation_partners').select('id, slug, portal_subdomain').eq('store_id', storeId);
  if (error) throw new Error(`partners query failed: ${error.message}`);
  const match = ((data ?? []) as Array<{ id: string; slug: string | null; portal_subdomain: string | null }>)
    .find((p) => p.id === ref || p.slug === ref || p.portal_subdomain === ref);
  return match?.id ?? null;
}
