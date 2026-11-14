import { describe, expect, it } from 'vitest';
import {
  buildTodayMovements,
  type EnrichedItem,
  type EnrichedOrderRow,
  type MovementsInput,
  type RawPickupRow,
} from '../src/lib/dashboard-today-movements.js';

const todayStartMs = Date.parse('2026-11-14T00:00:00+08:00');
const todayEndMs = Date.parse('2026-11-15T00:00:00+08:00');
const nowMs = Date.parse('2026-11-14T12:00:00+08:00');

const locations = [
  { id: 1, name: 'Lolas Store', location_type: 'store' },
  { id: 2, name: 'General Luna', location_type: 'delivery', delivery_cost: 200, collection_cost: 200 },
];

const base: MovementsInput = {
  todayStartMs,
  todayEndMs,
  nowMs,
  rawPickups: [],
  orders: [],
  completedReturns: [],
  orderAddons: new Map(),
  helmetNumbers: new Map(),
  locations,
  addonNames: new Map([[4, 'Surf rack'], [9, '9PM Return']]),
  modelNames: new Map([['beat', 'Honda Beat']]),
};

function raw(overrides: Partial<RawPickupRow>): RawPickupRow & { storeId: string } {
  return {
    id: 'r1', order_reference: 'LR-1', customer_name: 'Web Guest', customer_mobile: '+63', pickup_datetime: '2026-11-14T09:00:00+08:00',
    dropoff_datetime: '2026-11-16T09:00:00+08:00', vehicle_model_id: 'beat', pickup_location_id: 1, dropoff_location_id: 1,
    pickup_location_address: null, dropoff_location_address: null, addon_ids: null, transfer_type: null, flight_number: null,
    flight_arrival_time: null, customer_extra_comments: null, web_quote_raw: 2400, partner_ref: null,
    storeId: 'store-lolas', ...overrides,
  };
}

function item(overrides: Partial<EnrichedItem>): EnrichedItem {
  return {
    id: 'i1', vehicle_name: 'Beat 07', pickup_datetime: '2026-11-12T09:00:00+08:00', dropoff_datetime: '2026-11-14T15:00:00+08:00',
    pickup_location_id: 1, dropoff_location_id: 1, pickup_location: 'Lolas Store', dropoff_location: 'Lolas Store', pickup_fee: 0, dropoff_fee: 0,
    ...overrides,
  };
}

function order(overrides: Partial<EnrichedOrderRow>): EnrichedOrderRow {
  return {
    id: 'o1', store_id: 'store-lolas', status: 'active', booking_customer_name: 'Ana', customer_name: null, customer_mobile: '+63917',
    booking_token: 'LR-9', woo_order_id: null, partner_ref: null, web_notes: null, final_total: 3000, total_paid: 2500,
    security_deposit: 1000, has_nine_pm_addon: false, waiver_status: 'signed', items: [item({})], ...overrides,
  };
}

describe("today's pickups", () => {
  it('lists unactivated web bookings with add-on names, delivery address and flight details', () => {
    const { pickups } = buildTodayMovements({
      ...base,
      rawPickups: [
        raw({
          addon_ids: [4, 77],
          pickup_location_id: 2,
          pickup_location_address: 'Kalinaw Resort',
          transfer_type: 'Airport pickup',
          flight_number: 'PR2341',
          flight_arrival_time: '10:40',
        }),
        raw({ id: 'tomorrow', pickup_datetime: '2026-11-15T09:00:00+08:00' }),
      ],
    });
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({
      kind: 'raw',
      status: 'to_activate',
      vehicles: ['Honda Beat'],
      addons: ['Surf rack', 'Add-on #77'],
      delivery: { place: 'Kalinaw Resort' },
      collection: null,
      transfer: 'Airport pickup, flight PR2341 at 10:40',
      quote: 2400,
    });
    expect(pickups[0].raw).toMatchObject({ id: 'r1', transport_service: 'delivery' });
  });

  it('marks activated bookings as ready before pickup time and out after it', () => {
    const { pickups } = buildTodayMovements({
      ...base,
      orders: [
        order({ id: 'later', items: [item({ pickup_datetime: '2026-11-14T15:00:00+08:00', dropoff_datetime: '2026-11-17T15:00:00+08:00' })] }),
        order({ id: 'earlier', items: [item({ pickup_datetime: '2026-11-14T08:00:00+08:00', dropoff_datetime: '2026-11-17T08:00:00+08:00' })] }),
        order({ id: 'booked-ahead', status: 'confirmed', items: [item({ pickup_datetime: '2026-11-14T07:00:00+08:00', dropoff_datetime: '2026-11-17T08:00:00+08:00' })] }),
      ],
      orderAddons: new Map([['later', [{ name: 'Helmet', quantity: 2 }]]]),
    });
    expect(pickups.map((p) => [p.id, p.status])).toEqual([['booked-ahead', 'ready'], ['earlier', 'out'], ['later', 'ready']]);
    expect(pickups[2]).toMatchObject({ addons: ['Helmet ×2'], balanceDue: 500, waiverSigned: true });
  });
});

describe("today's returns", () => {
  it('flags overdue returns, 9PM add-ons, collections and helmet numbers', () => {
    const { returns } = buildTodayMovements({
      ...base,
      orders: [
        order({ id: 'late', items: [item({ dropoff_datetime: '2026-11-14T10:00:00+08:00' })] }),
        order({
          id: 'tonight',
          items: [item({ id: 'i9', dropoff_datetime: '2026-11-14T21:00:00+08:00', dropoff_location_id: 2, dropoff_location: 'General Luna', dropoff_fee: 200 })],
        }),
      ],
      orderAddons: new Map([['tonight', [{ name: '9PM Return', quantity: 1 }]]]),
      helmetNumbers: new Map([['i9', '4, 5']]),
    });
    expect(returns.map((r) => [r.orderId, r.status])).toEqual([['late', 'overdue'], ['tonight', 'due']]);
    expect(returns[1]).toMatchObject({ ninePm: true, collection: { place: 'General Luna' }, helmetNumbers: '4, 5', deposit: 1000 });
  });

  it('includes orders already settled today as returned', () => {
    const { returns } = buildTodayMovements({
      ...base,
      completedReturns: [
        { order_id: 'done', store_id: 'store-lolas', vehicle_name: 'Click 02', dropoff_datetime: '2026-11-14T09:00:00+08:00', reference: 'LR-5', customer_name: 'Ben' },
      ],
    });
    expect(returns).toEqual([expect.objectContaining({ orderId: 'done', status: 'returned', customerName: 'Ben', vehicles: ['Click 02'] })]);
  });
});
