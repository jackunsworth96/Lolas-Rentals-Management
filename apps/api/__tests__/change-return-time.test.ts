import { describe, expect, it, vi } from 'vitest';
import {
  changeReturnTime,
  previewReturnTimeRecalc,
  type ReturnTimeOrder,
} from '../src/use-cases/orders/change-return-time.js';

// Pickup Nov 4 10:45 Manila, 8 paid days (paid until Nov 12 10:45), booked return Nov 11 12:15.
const baseOrder = (): ReturnTimeOrder => ({
  id: 'order-1',
  status: 'active',
  items: [{
    id: 'item-1',
    storeId: 'store-1',
    vehicleId: 'veh-1',
    pickupDatetime: '2026-11-04T02:45:00.000Z',
    dropoffDatetime: '2026-11-11T04:15:00.000Z',
    rentalDaysCount: 8,
  }],
});

function setup(order: ReturnTimeOrder | null = baseOrder(), availableCount = 1) {
  const apply = vi.fn().mockResolvedValue(undefined);
  const checkAvailability = vi.fn().mockResolvedValue([{ modelId: 'model-1', availableCount }]);
  const deps = {
    port: {
      loadOrder: vi.fn().mockResolvedValue(order),
      findVehicleModelId: vi.fn().mockResolvedValue('model-1'),
      apply,
    },
    bookingPort: { checkAvailability } as never,
  };
  return { deps, apply, checkAvailability };
}

describe('changeReturnTime', () => {
  it('moves the return earlier without an availability check', async () => {
    const { deps, apply, checkAvailability } = setup();
    const result = await changeReturnTime(deps, {
      orderId: 'order-1',
      newDropoffDatetime: '2026-11-11T02:30:00.000Z',
      reason: 'Airport pickup 10:30',
      employeeId: 'emp-1',
    });

    expect(checkAvailability).not.toHaveBeenCalled();
    expect(result.newDropoffDatetime).toBe('2026-11-11T02:30:00.000Z');
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1',
      newDropoffDatetime: '2026-11-11T02:30:00.000Z',
      employeeId: 'emp-1',
      meta: expect.objectContaining({ oldDropoffDatetime: '2026-11-11T04:15:00.000Z', reason: 'Airport pickup 10:30' }),
    }));
    const body = apply.mock.calls[0][0].body as string;
    expect(body).toContain('Nov 11, 12:15 PM');
    expect(body).toContain('Nov 11, 10:30 AM');
    expect(body).toContain('Reason: Airport pickup 10:30');
  });

  it('allows a later return within the paid days when the vehicle is free', async () => {
    const { deps, apply, checkAvailability } = setup();
    await changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-11T08:00:00.000Z', employeeId: null });

    expect(checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        pickupDatetime: '2026-11-11T04:15:00.000Z',
        dropoffDatetime: '2026-11-11T08:00:00.000Z',
        excludeOrderItemId: 'item-1',
      }),
      { includeHiddenFromWebsite: true },
    );
    expect(apply).toHaveBeenCalled();
  });

  it('rejects a later return past the paid days and points to Extend', async () => {
    const { deps, apply } = setup();
    await expect(
      changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-12T03:00:00.000Z', employeeId: null }),
    ).rejects.toThrow(/Use Extend/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('allows a courtesy late return a few hours past the paid days at no charge', async () => {
    const { deps, apply, checkAvailability } = setup();
    const result = await changeReturnTime(deps, {
      orderId: 'order-1', newDropoffDatetime: '2026-11-12T06:45:00.000Z', reason: 'Late ferry', courtesy: true, employeeId: 'emp-1',
    });

    expect(result.reduction).toBe(0);
    expect(checkAvailability).toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ courtesy: true, courtesyHours: 4, reason: 'Late ferry' }),
    }));
    expect(apply.mock.calls[0][0].body).toContain('courtesy: 4h past paid days, no charge');
  });

  it('requires a reason for a courtesy late return', async () => {
    const { deps, apply } = setup();
    await expect(
      changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-12T06:45:00.000Z', courtesy: true, employeeId: null }),
    ).rejects.toThrow(/reason is required/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects a courtesy late return beyond the courtesy limit', async () => {
    const { deps, apply } = setup();
    await expect(
      changeReturnTime(deps, {
        orderId: 'order-1', newDropoffDatetime: '2026-11-12T16:00:00.000Z', reason: 'x', courtesy: true, employeeId: null,
      }),
    ).rejects.toThrow(/at most 12 hours/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects a later return when the vehicle is booked by someone else', async () => {
    const { deps, apply } = setup(baseOrder(), 0);
    await expect(
      changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-11T08:00:00.000Z', employeeId: null }),
    ).rejects.toThrow(/booked/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects a return before pickup', async () => {
    const { deps, apply } = setup();
    await expect(
      changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-04T01:00:00.000Z', employeeId: null }),
    ).rejects.toThrow(/after pickup/);
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects orders that are not active or confirmed', async () => {
    const { deps } = setup({ ...baseOrder(), status: 'completed' });
    await expect(
      changeReturnTime(deps, { orderId: 'order-1', newDropoffDatetime: '2026-11-11T02:30:00.000Z', employeeId: null }),
    ).rejects.toThrow(/active or confirmed/);
  });
});

// Picked up Nov 19 12:15 Manila for 3 days, extended (unpaid ₱1,890) to Nov 24 16:45 = 6 billed days.
const extendedOrder = (overrides: Partial<ReturnTimeOrder> = {}): ReturnTimeOrder => ({
  id: 'order-2',
  status: 'active',
  finalTotal: 3780,
  balanceDue: 1890,
  items: [{
    id: 'item-2',
    storeId: 'store-1',
    vehicleId: 'veh-1',
    pickupDatetime: '2026-11-19T04:15:00.000Z',
    dropoffDatetime: '2026-11-24T08:45:00.000Z',
    originalDropoffDatetime: '2026-11-22T04:15:00.000Z',
    rentalDaysCount: 6,
    rentalRate: 535,
  }],
  extensionPayments: [{ id: 'pay-ext', amount: 1890, pending: true }],
  perDayAddons: [{ id: 'addon-pom', name: 'Peace of Mind Cover (Scooter)', totalAmount: 570 }],
  ...overrides,
});

const NOV_23_1215 = '2026-11-23T04:15:00.000Z';

function setupRecalc(order: ReturnTimeOrder = extendedOrder()) {
  const apply = vi.fn().mockResolvedValue(undefined);
  const applyWithRecalc = vi.fn().mockResolvedValue(undefined);
  const priceExtension = vi.fn(async ({ fromIso, toIso }: { fromIso: string; toIso: string }) =>
    535 * Math.max(1, Math.ceil((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000)));
  const deps = {
    port: {
      loadOrder: vi.fn().mockResolvedValue(order),
      findVehicleModelId: vi.fn().mockResolvedValue('model-1'),
      apply,
      applyWithRecalc,
    },
    bookingPort: { checkAvailability: vi.fn() } as never,
    priceExtension,
  };
  return { deps, apply, applyWithRecalc, priceExtension };
}

describe('return time recalculation', () => {
  it('previews the reduced extension when the return moves a day and a half earlier', async () => {
    const { deps } = setupRecalc();
    const preview = await previewReturnTimeRecalc(deps, { orderId: 'order-2', newDropoffDatetime: NOV_23_1215 });

    expect(preview).toEqual(expect.objectContaining({
      eligible: true,
      oldDays: 6,
      newDays: 4,
      rentalDelta: 1070,
      addonDelta: 190,
      reduction: 1260,
      newFinalTotal: 2520,
      newBalanceDue: 630,
      addonUpdates: [{ id: 'addon-pom', name: 'Peace of Mind Cover (Scooter)', oldTotal: 570, newTotal: 380 }],
    }));
  });

  it('applies the reduction through applyWithRecalc when recalculate is set', async () => {
    const { deps, apply, applyWithRecalc } = setupRecalc();
    const result = await changeReturnTime(deps, {
      orderId: 'order-2', newDropoffDatetime: NOV_23_1215, recalculate: true, employeeId: 'emp-1',
    });

    expect(result.reduction).toBe(1260);
    expect(apply).not.toHaveBeenCalled();
    expect(applyWithRecalc).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-2',
      orderItemId: 'item-2',
      newDays: 4,
      reduction: 1260,
      newToLabel: '2026-11-23',
      meta: expect.objectContaining({ recalculated: true, oldDays: 6, newDays: 4, reduction: 1260 }),
    }));
    expect(applyWithRecalc.mock.calls[0][0].body).toContain('Total reduced by ₱1,260 (6 → 4 days)');
  });

  it('stays price-neutral when recalculate is not set', async () => {
    const { deps, apply, applyWithRecalc } = setupRecalc();
    const result = await changeReturnTime(deps, { orderId: 'order-2', newDropoffDatetime: NOV_23_1215, employeeId: null });

    expect(result.reduction).toBe(0);
    expect(apply).toHaveBeenCalled();
    expect(applyWithRecalc).not.toHaveBeenCalled();
  });

  it('removes the whole extension when the return goes back to the original time', async () => {
    const { deps } = setupRecalc();
    const preview = await previewReturnTimeRecalc(deps, { orderId: 'order-2', newDropoffDatetime: '2026-11-22T04:15:00.000Z' });
    expect(preview).toEqual(expect.objectContaining({ eligible: true, newDays: 3, reduction: 1890, newBalanceDue: 0 }));
  });

  it('caps the reduction at the unpaid extension total', async () => {
    const { deps } = setupRecalc(extendedOrder({ extensionPayments: [{ id: 'pay-ext', amount: 1000, pending: true }] }));
    const preview = await previewReturnTimeRecalc(deps, { orderId: 'order-2', newDropoffDatetime: NOV_23_1215 });
    expect(preview).toEqual(expect.objectContaining({ eligible: true, reduction: 1000 }));
  });

  it.each([
    ['the extension is already paid', extendedOrder({ extensionPayments: [{ id: 'pay-ext', amount: 1890, pending: false }] }), NOV_23_1215, /already been paid/],
    ['there is no unpaid extension', extendedOrder({ extensionPayments: [] }), NOV_23_1215, /no unpaid extension/],
    ['the return moves later', extendedOrder(), '2026-11-24T10:00:00.000Z', /not moving earlier/],
    ['the return is before the original return', extendedOrder(), '2026-11-21T04:15:00.000Z', /use Refund/],
    ['the billed days do not change', extendedOrder(), '2026-11-24T06:00:00.000Z', /billed days/],
  ])('is not eligible when %s', async (_label, order, newDropoff, reason) => {
    const { deps, applyWithRecalc } = setupRecalc(order);
    const preview = await previewReturnTimeRecalc(deps, { orderId: 'order-2', newDropoffDatetime: newDropoff });
    expect(preview.eligible).toBe(false);
    expect(preview.eligible === false && preview.reason).toMatch(reason);

    if (newDropoff < order.items[0].dropoffDatetime) {
      await expect(
        changeReturnTime(deps, { orderId: 'order-2', newDropoffDatetime: newDropoff, recalculate: true, employeeId: null }),
      ).rejects.toThrow(reason);
      expect(applyWithRecalc).not.toHaveBeenCalled();
    }
  });
});
