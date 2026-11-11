import { describe, expect, it, vi } from 'vitest';
import { changeReturnTime, type ReturnTimeOrder } from '../src/use-cases/orders/change-return-time.js';

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
