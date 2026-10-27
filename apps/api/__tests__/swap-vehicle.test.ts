import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Money, Vehicle, type FleetRepository, type OrderItem, type OrderItemRepository, type OrderRepository, type VehicleProps } from '@lolas/domain';

const tables = vi.hoisted(() => ({ data: {} as Record<string, unknown>, inserts: [] as Array<{ table: string; row: unknown }> }));

vi.mock('../src/adapters/supabase/client.js', () => {
  const builder = (table: string) => {
    const result = () => ({ data: tables.data[table] ?? [], error: null });
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'lt', 'gt', 'is']) query[method] = () => query;
    query.maybeSingle = async () => result();
    query.insert = async (row: unknown) => { tables.inserts.push({ table, row }); return { error: null }; };
    query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  };
  const client = { from: (table: string) => builder(table) };
  return { supabase: client, getSupabaseClient: () => client };
});

const { swapVehicle } = await import('../src/use-cases/orders/swap-vehicle.js');

function vehicle(id: string, name: string, modelId: string, status = 'Available'): Vehicle {
  const props: VehicleProps = {
    id, storeId: 'store-lolas', name, modelId, plateNumber: null, gpsId: null, status,
    currentMileage: 0, orcrExpiryDate: null, surfRack: false, owner: null, rentableStartDate: null,
    registrationDate: null, purchasePrice: null, purchaseDate: null, setUpCosts: 0, totalBikeCost: 0,
    usefulLifeMonths: null, salvageValue: 0, accumulatedDepreciation: 0, bookValue: 0, dateSold: null,
    soldPrice: null, profitLoss: null, createdAt: new Date(), updatedAt: new Date(),
  };
  return Vehicle.create(props);
}

const item: OrderItem = {
  id: 'item-1', storeId: 'store-lolas', orderId: 'order-1', vehicleId: 'VEH14', vehicleName: 'Sydney',
  pickupDatetime: '2026-10-26T07:15:00.000Z', dropoffDatetime: '2026-10-29T08:45:00.000Z', rentalDaysCount: 4,
  pickupLocation: 'General Luna', dropoffLocation: 'Store', pickupFee: 100, dropoffFee: 0, rentalRate: 535,
  helmetNumbers: null, discount: 0, opsNotes: null, returnCondition: null,
};

function setup() {
  const saved: OrderItem[] = [];
  const order = { finalTotal: Money.php(2340), balanceDue: Money.php(0), adjustTotal: vi.fn(function (this: { finalTotal: Money; balanceDue: Money }, delta: Money) {
    this.finalTotal = this.finalTotal.add(delta); this.balanceDue = this.balanceDue.add(delta);
  }) };
  const orderRepo = { findById: vi.fn(async () => order), save: vi.fn(async () => {}) } as unknown as OrderRepository;
  const orderItemRepo = {
    findByOrderId: vi.fn(async () => [item]),
    save: vi.fn(async (i: OrderItem) => { saved.push(i); }),
  } as unknown as OrderItemRepository;
  const fleet = new Map([
    ['SUB', vehicle('SUB', 'Sub-lease TukTuk', 'Bajaj RE TukTuk')],
    ['VEH21', vehicle('VEH21', 'Bogart', 'TVS King TukTuk')],
  ]);
  const fleetRepo = {
    findById: vi.fn(async (id: string) => fleet.get(id) ?? null),
    updateStatus: vi.fn(async () => {}),
  } as unknown as FleetRepository;
  return { deps: { orderRepo, orderItemRepo, fleetRepo }, saved, order, orderRepo };
}

beforeEach(() => {
  tables.inserts.length = 0;
  tables.data = {
    vehicle_models: { name: 'TukTuk (RE)', is_active: true },
    order_items: [],
    orders_raw: [],
    fleet_unavailability: [],
  };
});

describe('swapVehicle', () => {
  it('keeps the current rate by default', async () => {
    const { deps, saved, orderRepo } = setup();
    const result = await swapVehicle(deps, { orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'SUB', reason: 'fix', employeeId: 'e1' });
    expect(saved[0].vehicleName).toBe('Sub-lease TukTuk');
    expect(saved[0].rentalRate).toBe(535);
    expect(result.totalDelta).toBe(0);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('re-prices the rental and adjusts the order total when a new rate is given', async () => {
    const { deps, saved, order } = setup();
    const result = await swapVehicle(deps, {
      orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'SUB', reason: 'fix', employeeId: 'e1', newRentalRate: 1695,
    });
    expect(saved[0].rentalRate).toBe(1695);
    expect(result.totalDelta).toBe(4640);
    expect(order.finalTotal.toNumber()).toBe(6980);
    expect(result.balanceDue).toBe(4640);
    const swapRow = tables.inserts.find((i) => i.table === 'vehicle_swaps')?.row as { reason: string };
    expect(swapRow.reason).toContain('535 → 1695');
  });

  it('explains when the new vehicle is on a switched-off model', async () => {
    tables.data.vehicle_models = { name: 'TukTuk (TVS)', is_active: false };
    const { deps, saved } = setup();
    await expect(swapVehicle(deps, { orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'VEH21', reason: 'x', employeeId: 'e1' }))
      .rejects.toThrow('Bogart is a TukTuk (TVS), which is switched off');
    expect(saved).toHaveLength(0);
  });

  it('refuses a vehicle already booked on another active rental for those dates', async () => {
    tables.data.order_items = [{ id: 'other', orders: { status: 'active', booking_customer_name: 'Edison' } }];
    const { deps, saved } = setup();
    await expect(swapVehicle(deps, { orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'SUB', reason: 'x', employeeId: 'e1' }))
      .rejects.toThrow('already booked on another rental (Edison)');
    expect(saved).toHaveLength(0);
  });

  it('ignores completed rentals and finished owner-use periods', async () => {
    tables.data.order_items = [{ id: 'old', orders: { status: 'completed', booking_customer_name: 'Fedde' } }];
    tables.data.fleet_unavailability = [{ id: 'u1', ends_at: '2026-10-20T00:00:00.000Z' }];
    const { deps, saved } = setup();
    await swapVehicle(deps, { orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'SUB', reason: 'x', employeeId: 'e1' });
    expect(saved).toHaveLength(1);
  });

  it('refuses a vehicle reserved for open-ended owner use', async () => {
    tables.data.fleet_unavailability = [{ id: 'u1', ends_at: null }];
    const { deps } = setup();
    await expect(swapVehicle(deps, { orderId: 'order-1', orderItemId: 'item-1', newVehicleId: 'SUB', reason: 'x', employeeId: 'e1' }))
      .rejects.toThrow('reserved for owner use');
  });
});
