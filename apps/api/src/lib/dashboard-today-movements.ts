import { calculateBalanceDue } from '@lolas/shared';
import { buildLocationIndex, deriveTransportService, isLegOffsite, type TransportLocation } from './transport-service.js';

const NINE_PM_PATTERN = /9\s*pm|21:00|ninepm/i;

export interface RawPickupRow {
  id: string;
  order_reference: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  vehicle_model_id: string | null;
  pickup_location_id: number | null;
  dropoff_location_id: number | null;
  pickup_location_address: string | null;
  dropoff_location_address: string | null;
  addon_ids: number[] | null;
  transfer_type: string | null;
  flight_number: string | null;
  flight_arrival_time: string | null;
  customer_extra_comments: string | null;
  web_quote_raw: number | string | null;
  partner_ref: string | null;
  [key: string]: unknown;
}

export interface EnrichedItem {
  id: string;
  vehicle_name: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  pickup_location_id: string | number | null;
  dropoff_location_id: string | number | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_fee: number | string | null;
  dropoff_fee: number | string | null;
}

export interface EnrichedOrderRow {
  id: string;
  store_id: string;
  status: string;
  booking_customer_name: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  booking_token: string | null;
  woo_order_id: string | null;
  partner_ref: string | null;
  web_notes: string | null;
  final_total: number | string | null;
  total_paid: number | string | null;
  security_deposit: number | string | null;
  has_nine_pm_addon: boolean;
  waiver_status: string;
  items: EnrichedItem[] | null;
}

export interface CompletedReturnRow {
  order_id: string;
  store_id: string;
  vehicle_name: string | null;
  dropoff_datetime: string;
  reference: string | null;
  customer_name: string | null;
}

export interface MovementsInput {
  todayStartMs: number;
  todayEndMs: number;
  nowMs: number;
  rawPickups: Array<RawPickupRow & { storeId: string }>;
  orders: EnrichedOrderRow[];
  completedReturns: CompletedReturnRow[];
  /** order_id → add-on lines on activated orders. */
  orderAddons: Map<string, Array<{ name: string; quantity: number }>>;
  /** order_item id → helmet numbers. */
  helmetNumbers: Map<string, string | null>;
  locations: TransportLocation[];
  addonNames: Map<number, string>;
  modelNames: Map<string, string>;
}

export interface TransportLegInfo {
  /** Where the vehicle is handed over or collected; null when the address isn't known. */
  place: string | null;
}

export interface PickupMovement {
  key: string;
  kind: 'raw' | 'order';
  id: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  time: string;
  until: string | null;
  vehicles: string[];
  addons: string[];
  delivery: TransportLegInfo | null;
  collection: TransportLegInfo | null;
  transfer: string | null;
  notes: string | null;
  balanceDue: number | null;
  quote: number | null;
  waiverSigned: boolean | null;
  partnerRef: string | null;
  status: 'to_activate' | 'ready' | 'out';
  /** The inbox row, so the activation modal can open without another request. */
  raw?: Record<string, unknown>;
}

export interface ReturnMovement {
  key: string;
  orderId: string;
  storeId: string;
  reference: string | null;
  customerName: string;
  mobile: string | null;
  time: string;
  vehicles: string[];
  helmetNumbers: string | null;
  collection: TransportLegInfo | null;
  ninePm: boolean;
  balanceDue: number;
  deposit: number;
  status: 'due' | 'overdue' | 'returned';
}

export interface TodayMovements {
  pickups: PickupMovement[];
  returns: ReturnMovement[];
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

function formatAddon(name: string, quantity: number): string {
  return quantity > 1 ? `${name} ×${quantity}` : name;
}

function countVehicles(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n));
}

export function buildTodayMovements(input: MovementsInput): TodayMovements {
  const { todayStartMs, todayEndMs, nowMs } = input;
  const index = buildLocationIndex(input.locations);
  const locationName = (id: string | number | null | undefined) =>
    id === null || id === undefined ? null : index.byId.get(String(id))?.name ?? null;
  const isToday = (t: number) => t >= todayStartMs && t < todayEndMs;

  const pickups: PickupMovement[] = [];
  const returns: ReturnMovement[] = [];

  for (const r of input.rawPickups) {
    if (!r.pickup_datetime || !isToday(ms(r.pickup_datetime))) continue;
    const transport = deriveTransportService([r], input.locations, {
      unknownNamedLocationsRequireTransport: Boolean(r.partner_ref),
    });
    const flight = [r.flight_number, r.flight_arrival_time].filter(Boolean).join(' at ');
    pickups.push({
      key: `raw-${r.id}`,
      kind: 'raw',
      id: r.id,
      storeId: r.storeId,
      reference: r.order_reference,
      customerName: r.customer_name?.trim() || '—',
      mobile: r.customer_mobile,
      time: r.pickup_datetime,
      until: r.dropoff_datetime,
      vehicles: [r.vehicle_model_id ? input.modelNames.get(r.vehicle_model_id) ?? r.vehicle_model_id : 'Vehicle not chosen'],
      addons: (r.addon_ids ?? []).map((id) => input.addonNames.get(id) ?? `Add-on #${id}`),
      delivery: transport === 'delivery' || transport === 'both'
        ? { place: r.pickup_location_address?.trim() || locationName(r.pickup_location_id) }
        : null,
      collection: transport === 'collection' || transport === 'both'
        ? { place: r.dropoff_location_address?.trim() || locationName(r.dropoff_location_id) }
        : null,
      transfer: r.transfer_type ? `${r.transfer_type}${flight ? `, flight ${flight}` : ''}` : null,
      notes: r.customer_extra_comments?.trim() || null,
      balanceDue: null,
      quote: r.web_quote_raw == null ? null : num(r.web_quote_raw),
      waiverSigned: null,
      partnerRef: r.partner_ref,
      status: 'to_activate',
      raw: { ...r, transport_service: transport },
    });
  }

  for (const o of input.orders) {
    const items = o.items ?? [];
    const options = { unknownNamedLocationsRequireTransport: Boolean(o.partner_ref) };
    const customerName = o.booking_customer_name?.trim() || o.customer_name?.trim() || '—';
    const reference = o.booking_token ?? o.woo_order_id ?? null;
    const balanceDue = calculateBalanceDue(num(o.final_total), num(o.total_paid));
    const addons = (input.orderAddons.get(o.id) ?? []).map((a) => formatAddon(a.name, a.quantity));

    const pickedUpToday = items.filter((i) => isToday(ms(i.pickup_datetime)));
    if (pickedUpToday.length > 0) {
      const first = pickedUpToday.reduce((a, b) => (ms(a.pickup_datetime) <= ms(b.pickup_datetime) ? a : b));
      const deliveryLeg = pickedUpToday.find((i) => isLegOffsite(i.pickup_location_id, i.pickup_location, i.pickup_fee, index, options));
      const collectionLeg = pickedUpToday.find((i) => isLegOffsite(i.dropoff_location_id, i.dropoff_location, i.dropoff_fee, index, options));
      pickups.push({
        key: `order-${o.id}`,
        kind: 'order',
        id: o.id,
        storeId: o.store_id,
        reference,
        customerName,
        mobile: o.customer_mobile,
        time: first.pickup_datetime!,
        until: first.dropoff_datetime,
        vehicles: countVehicles(pickedUpToday.map((i) => i.vehicle_name ?? 'Vehicle')),
        addons,
        delivery: deliveryLeg ? { place: deliveryLeg.pickup_location || locationName(deliveryLeg.pickup_location_id) } : null,
        collection: collectionLeg ? { place: collectionLeg.dropoff_location || locationName(collectionLeg.dropoff_location_id) } : null,
        transfer: null,
        notes: o.web_notes?.trim() || null,
        balanceDue,
        quote: null,
        waiverSigned: o.waiver_status === 'signed',
        partnerRef: o.partner_ref,
        status: o.status === 'active' && ms(first.pickup_datetime) <= nowMs ? 'out' : 'ready',
      });
    }

    const returningToday = o.status === 'active' ? items.filter((i) => isToday(ms(i.dropoff_datetime))) : [];
    if (returningToday.length > 0) {
      const first = returningToday.reduce((a, b) => (ms(a.dropoff_datetime) <= ms(b.dropoff_datetime) ? a : b));
      const collectionLeg = returningToday.find((i) => isLegOffsite(i.dropoff_location_id, i.dropoff_location, i.dropoff_fee, index, options));
      const helmets = returningToday.map((i) => input.helmetNumbers.get(i.id)).filter(Boolean).join(', ');
      returns.push({
        key: `return-${o.id}`,
        orderId: o.id,
        storeId: o.store_id,
        reference,
        customerName,
        mobile: o.customer_mobile,
        time: first.dropoff_datetime!,
        vehicles: returningToday.map((i) => i.vehicle_name ?? 'Vehicle'),
        helmetNumbers: helmets || null,
        collection: collectionLeg ? { place: collectionLeg.dropoff_location || locationName(collectionLeg.dropoff_location_id) } : null,
        ninePm: o.has_nine_pm_addon || addons.some((a) => NINE_PM_PATTERN.test(a)),
        balanceDue,
        deposit: num(o.security_deposit),
        status: ms(first.dropoff_datetime) < nowMs ? 'overdue' : 'due',
      });
    }
  }

  const completedByOrder = new Map<string, CompletedReturnRow[]>();
  for (const row of input.completedReturns) {
    if (!isToday(ms(row.dropoff_datetime))) continue;
    completedByOrder.set(row.order_id, [...(completedByOrder.get(row.order_id) ?? []), row]);
  }
  for (const [orderId, rows] of completedByOrder) {
    const first = rows.reduce((a, b) => (ms(a.dropoff_datetime) <= ms(b.dropoff_datetime) ? a : b));
    returns.push({
      key: `return-${orderId}`,
      orderId,
      storeId: first.store_id,
      reference: first.reference,
      customerName: first.customer_name?.trim() || '—',
      mobile: null,
      time: first.dropoff_datetime,
      vehicles: rows.map((r) => r.vehicle_name ?? 'Vehicle'),
      helmetNumbers: null,
      collection: null,
      ninePm: false,
      balanceDue: 0,
      deposit: 0,
      status: 'returned',
    });
  }

  pickups.sort((a, b) => ms(a.time) - ms(b.time));
  returns.sort((a, b) => ms(a.time) - ms(b.time));
  return { pickups, returns };
}
