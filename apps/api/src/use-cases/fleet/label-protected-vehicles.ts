import type { SupabaseClient } from '@supabase/supabase-js';
import { HANDOVER_MS } from '../../lib/availability-finder.js';
import { assignProtectionLabels, blockingPartners, bookableUnits } from '../../lib/partner-protection.js';
import { loadProtectionData, resolvePartnerRef } from './protection-inputs.js';

export interface ProtectedLabel {
  partnerId: string | null;
  partnerName: string | null;
  vehicleType: string;
}

export interface ProtectionLabels {
  labels: Map<string, ProtectedLabel>;
  /** Allocation vehicle type ('bike' | 'tuktuk') of each vehicle, when allocations are on. */
  vehicleTypes: Map<string, string>;
}

/**
 * Among vehicles that are physically free for [pickup, dropoff], the ones the
 * allocation rules keep back from this booking. Bikes with no upcoming
 * booking carry the label first, matching the Fleet page.
 */
export async function labelProtectedForWindow(
  sb: SupabaseClient,
  storeId: string,
  vehicles: Array<{ id: string; name: string; model_id: string | null }>,
  pickupDatetime: string,
  dropoffDatetime: string,
  partnerRef: string | null | undefined,
): Promise<ProtectionLabels> {
  const labels = new Map<string, ProtectedLabel>();
  const vehicleTypes = new Map<string, string>();
  if (vehicles.length === 0) return { labels, vehicleTypes };
  const startMs = Date.parse(pickupDatetime);
  const endMs = Date.parse(dropoffDatetime) + HANDOVER_MS;
  const protection = await loadProtectionData(sb, storeId, startMs, endMs);
  if (!protection.enabled) return { labels, vehicleTypes };
  const partnerId = await resolvePartnerRef(sb, storeId, partnerRef);

  const byType = new Map<string, typeof vehicles>();
  for (const v of vehicles) {
    const vehicleType = v.model_id ? protection.typeOfModel.get(v.model_id) : undefined;
    if (!vehicleType) continue;
    vehicleTypes.set(v.id, vehicleType);
    byType.set(vehicleType, [...(byType.get(vehicleType) ?? []), v]);
  }

  for (const [vehicleType, list] of byType) {
    const capacity = bookableUnits(protection, vehicleType, partnerId, startMs, endMs);
    if (capacity >= list.length) continue;
    const blockers = blockingPartners(protection, vehicleType, partnerId, startMs, endMs);
    const nextBooking = await nextBookingByVehicle(sb, list.map((v) => v.id), dropoffDatetime);
    const ordered = [...list].sort((a, b) =>
      (nextBooking.get(b.id) ?? Number.POSITIVE_INFINITY) - (nextBooking.get(a.id) ?? Number.POSITIVE_INFINITY)
      || a.name.localeCompare(b.name));
    for (const [id, label] of assignProtectionLabels(ordered, blockers, list.length - capacity)) {
      labels.set(id, {
        partnerId: label.partnerId ?? blockers[0]?.partnerId ?? null,
        partnerName: label.partnerName ?? blockers[0]?.partnerName ?? null,
        vehicleType,
      });
    }
  }
  return { labels, vehicleTypes };
}

async function nextBookingByVehicle(sb: SupabaseClient, vehicleIds: string[], afterIso: string): Promise<Map<string, number>> {
  const [items, raws] = await Promise.all([
    sb.from('order_items').select('vehicle_id, pickup_datetime, orders!inner(status)')
      .in('vehicle_id', vehicleIds).gte('pickup_datetime', afterIso)
      .not('orders.status', 'in', '(cancelled,completed)'),
    sb.from('orders_raw').select('vehicle_id, pickup_datetime')
      .in('vehicle_id', vehicleIds).eq('status', 'unprocessed').gte('pickup_datetime', afterIso),
  ]);
  if (items.error) throw new Error(`order_items query failed: ${items.error.message}`);
  if (raws.error) throw new Error(`orders_raw query failed: ${raws.error.message}`);
  const next = new Map<string, number>();
  for (const row of [...(items.data ?? []), ...(raws.data ?? [])] as Array<{ vehicle_id: string; pickup_datetime: string }>) {
    const t = Date.parse(row.pickup_datetime);
    if (!next.has(row.vehicle_id) || t < next.get(row.vehicle_id)!) next.set(row.vehicle_id, t);
  }
  return next;
}
