import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerUseNotEndedBy } from '../../lib/owner-use-window.js';
import type { FixedBlock, FloatingBooking, FinderModel, FinderVehicle } from '../../lib/availability-finder.js';
import { HANDOVER_MS } from '../../lib/availability-finder.js';

/** Must match the statuses evaluateAvailability treats as non-rentable. */
const NON_RENTABLE = ['Under Maintenance', 'Maintenance', 'Inactive', 'Sold', 'Service Vehicle', 'Closed', 'Retired', 'Pending ORCR'];

export interface AvailabilityInputs {
  vehicles: FinderVehicle[];
  models: Map<string, FinderModel>;
  notRentable: Array<{ vehicle: FinderVehicle; reason: 'missing_model' | 'non_rentable_status' | 'inactive_model'; detail: string | null }>;
  blocks: Map<string, FixedBlock[]>;
  floating: Map<string, FloatingBooking[]>;
}

const ms = (iso: string | null | undefined, fallback: number) => (iso ? new Date(iso).getTime() : fallback);
const one = <T>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/**
 * Same bookings, holds and owner-use periods evaluateAvailability reads, over
 * [fromMs, toMs), keeping the booking reference on each so staff can see who
 * holds a vehicle. Blocks are [pickup, dropoff + handover), like the engine.
 */
export async function loadAvailabilityInputs(
  sb: SupabaseClient,
  storeId: string,
  fromMs: number,
  toMs: number,
): Promise<AvailabilityInputs> {
  const fromBuffered = new Date(fromMs - HANDOVER_MS).toISOString();
  const toIso = new Date(toMs).toISOString();

  const { data: fleetRows, error: fleetErr } = await sb.from('fleet')
    .select('id, name, model_id, status, surf_rack').eq('store_id', storeId);
  if (fleetErr) throw new Error(`fleet query failed: ${fleetErr.message}`);
  const allVehicles = ((fleetRows ?? []) as Array<{ id: string; name: string; model_id: string | null; status: string; surf_rack: boolean | null }>)
    .map((v): FinderVehicle => ({ id: v.id, name: v.name, modelId: v.model_id, status: v.status, surfRack: v.surf_rack ?? false }));

  const modelIds = [...new Set(allVehicles.map((v) => v.modelId).filter((id): id is string => Boolean(id)))];
  const models = new Map<string, FinderModel>();
  if (modelIds.length > 0) {
    const { data: modelRows, error: modelErr } = await sb.from('vehicle_models')
      .select('id, name, type, is_active, show_on_customer_website').in('id', modelIds);
    if (modelErr) throw new Error(`vehicle_models query failed: ${modelErr.message}`);
    for (const m of (modelRows ?? []) as Array<{ id: string; name: string; type: string | null; is_active: boolean; show_on_customer_website: boolean | null }>) {
      models.set(m.id, { id: m.id, name: m.name, type: m.type, isActive: m.is_active, showOnWebsite: m.show_on_customer_website !== false });
    }
  }

  const notRentable: AvailabilityInputs['notRentable'] = [];
  const vehicles: FinderVehicle[] = [];
  for (const vehicle of allVehicles) {
    if (!vehicle.modelId) notRentable.push({ vehicle, reason: 'missing_model', detail: null });
    else if (NON_RENTABLE.includes(vehicle.status)) notRentable.push({ vehicle, reason: 'non_rentable_status', detail: vehicle.status });
    else if (!models.get(vehicle.modelId)?.isActive) notRentable.push({ vehicle, reason: 'inactive_model', detail: models.get(vehicle.modelId)?.name ?? vehicle.modelId });
    else vehicles.push(vehicle);
  }
  const vehicleIds = vehicles.map((v) => v.id);

  const floating = new Map<string, FloatingBooking[]>();
  const addFloating = (booking: FloatingBooking) => {
    const list = floating.get(booking.modelId) ?? [];
    list.push(booking);
    floating.set(booking.modelId, list);
  };
  const [directRes, holdRes] = await Promise.all([
    sb.from('orders_raw').select('id, order_reference, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime')
      .eq('store_id', storeId).eq('booking_channel', 'direct').eq('status', 'unprocessed')
      .not('vehicle_model_id', 'is', null)
      .lt('pickup_datetime', toIso).gt('dropoff_datetime', fromBuffered),
    sb.from('booking_holds').select('vehicle_model_id, pickup_datetime, dropoff_datetime')
      .eq('store_id', storeId).gt('expires_at', new Date().toISOString())
      .lt('pickup_datetime', toIso).gt('dropoff_datetime', fromBuffered),
  ]);
  if (directRes.error) throw new Error(`orders_raw direct query failed: ${directRes.error.message}`);
  if (holdRes.error) throw new Error(`booking_holds query failed: ${holdRes.error.message}`);
  for (const row of (directRes.data ?? []) as Array<{ id: string; order_reference: string | null; customer_name: string | null; vehicle_model_id: string; pickup_datetime: string; dropoff_datetime: string }>) {
    addFloating({
      modelId: row.vehicle_model_id, start: ms(row.pickup_datetime, 0), end: ms(row.dropoff_datetime, 0) + HANDOVER_MS,
      hold: false, reference: row.order_reference, customerName: row.customer_name, rawOrderId: row.id,
    });
  }
  for (const row of (holdRes.data ?? []) as Array<{ vehicle_model_id: string; pickup_datetime: string; dropoff_datetime: string }>) {
    addFloating({
      modelId: row.vehicle_model_id, start: ms(row.pickup_datetime, 0), end: ms(row.dropoff_datetime, 0) + HANDOVER_MS,
      hold: true, reference: null, customerName: null, rawOrderId: null,
    });
  }

  // Fixed blocks are loaded across every unassigned booking's span so they can be placed.
  let horizonStart = fromMs;
  let horizonEnd = toMs;
  for (const list of floating.values()) {
    for (const f of list) {
      horizonStart = Math.min(horizonStart, f.start);
      horizonEnd = Math.max(horizonEnd, f.end);
    }
  }
  const horizonStartIso = new Date(horizonStart).toISOString();
  const horizonStartBuffered = new Date(horizonStart - HANDOVER_MS).toISOString();
  const horizonEndIso = new Date(horizonEnd).toISOString();

  const blocks = new Map<string, FixedBlock[]>();
  const addBlock = (vehicleId: string, block: FixedBlock) => {
    const list = blocks.get(vehicleId) ?? [];
    list.push(block);
    blocks.set(vehicleId, list);
  };

  type ItemRow = {
    id: string; order_id: string; vehicle_id: string; pickup_datetime: string; dropoff_datetime: string;
    orders: { status: string; booking_token: string | null; booking_customer_name: string | null } | Array<{ status: string; booking_token: string | null; booking_customer_name: string | null }> | null;
  };
  const itemSelect = 'id, order_id, vehicle_id, pickup_datetime, dropoff_datetime, orders!inner(status, booking_token, booking_customer_name)';
  const [itemRes, overdueRes, walkInRes, ownerRes] = await Promise.all([
    sb.from('order_items').select(itemSelect)
      .eq('store_id', storeId).not('vehicle_id', 'is', null)
      .not('pickup_datetime', 'is', null).not('dropoff_datetime', 'is', null)
      .lt('pickup_datetime', horizonEndIso).gt('dropoff_datetime', horizonStartBuffered),
    // Still out past their return time: the engine no longer counts them, but the bike isn't back.
    sb.from('order_items').select(itemSelect)
      .eq('store_id', storeId).not('vehicle_id', 'is', null).eq('orders.status', 'active')
      .not('dropoff_datetime', 'is', null).lte('dropoff_datetime', horizonStartBuffered),
    sb.from('orders_raw').select('id, vehicle_id, order_reference, customer_name, pickup_datetime, dropoff_datetime')
      .eq('store_id', storeId).eq('booking_channel', 'walk_in').eq('status', 'unprocessed')
      .not('vehicle_id', 'is', null)
      .lt('pickup_datetime', horizonEndIso).gt('dropoff_datetime', horizonStartBuffered),
    vehicleIds.length > 0
      ? sb.from('fleet_unavailability').select('vehicle_id, starts_at, ends_at, note')
        .eq('store_id', storeId).eq('type', 'owner_use').is('cancelled_at', null)
        .in('vehicle_id', vehicleIds)
        .lt('starts_at', horizonEndIso).or(ownerUseNotEndedBy(horizonStartIso))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemRes.error) throw new Error(`order_items query failed: ${itemRes.error.message}`);
  if (overdueRes.error) throw new Error(`overdue order_items query failed: ${overdueRes.error.message}`);
  if (walkInRes.error) throw new Error(`orders_raw walk-in query failed: ${walkInRes.error.message}`);
  if (ownerRes.error) throw new Error(`fleet_unavailability query failed: ${ownerRes.error.message}`);

  const nowMs = Date.now();
  const seenItems = new Set<string>();
  for (const row of [...(itemRes.data ?? []), ...(overdueRes.data ?? [])] as unknown as ItemRow[]) {
    if (seenItems.has(row.id)) continue;
    seenItems.add(row.id);
    const order = one(row.orders);
    if (!order || order.status === 'cancelled' || order.status === 'completed') continue;
    const end = ms(row.dropoff_datetime, Number.POSITIVE_INFINITY) + HANDOVER_MS;
    addBlock(row.vehicle_id, {
      start: ms(row.pickup_datetime, Number.NEGATIVE_INFINITY), end,
      kind: 'order', reference: order.booking_token, customerName: order.booking_customer_name,
      orderId: row.order_id, rawOrderId: null, pickedUp: order.status === 'active',
      // Judged against the real clock: a rental due before a future "from" date isn't late yet.
      overdue: order.status === 'active' && ms(row.dropoff_datetime, Number.POSITIVE_INFINITY) < nowMs,
    });
  }
  for (const row of (walkInRes.data ?? []) as Array<{ id: string; vehicle_id: string; order_reference: string | null; customer_name: string | null; pickup_datetime: string; dropoff_datetime: string }>) {
    addBlock(row.vehicle_id, {
      start: ms(row.pickup_datetime, Number.NEGATIVE_INFINITY), end: ms(row.dropoff_datetime, Number.POSITIVE_INFINITY) + HANDOVER_MS,
      kind: 'walk_in', reference: row.order_reference, customerName: row.customer_name,
      orderId: null, rawOrderId: row.id, pickedUp: false, overdue: false,
    });
  }
  for (const row of (ownerRes.data ?? []) as Array<{ vehicle_id: string; starts_at: string; ends_at: string | null; note: string | null }>) {
    addBlock(row.vehicle_id, {
      start: ms(row.starts_at, Number.NEGATIVE_INFINITY),
      end: row.ends_at ? ms(row.ends_at, Number.POSITIVE_INFINITY) + HANDOVER_MS : Number.POSITIVE_INFINITY,
      kind: 'owner_use', reference: null, customerName: row.note,
      orderId: null, rawOrderId: null, pickedUp: false, overdue: false,
    });
  }

  return { vehicles, models, notRentable, blocks, floating };
}
