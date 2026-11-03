import { describe, expect, it, vi } from 'vitest';
import { adjustDates } from '../src/use-cases/orders/adjust-dates.js';

describe('adjustDates', () => {
  it('rescales per-day add-ons by days without double-counting quantity', async () => {
    const order = { id: 'order-1', storeId: 'store-1', adjustTotal: vi.fn(), finalTotal: { toNumber: () => 0 }, balanceDue: { toNumber: () => 0 } };
    const item = {
      id: 'item-1', rentalRate: 535, rentalDaysCount: 4, pickupFee: 0, dropoffFee: 0, discount: 0,
      pickupDatetime: '2026-10-30T01:15:00.000Z', dropoffDatetime: '2026-11-02T08:45:00.000Z',
    };
    // Booking flow stores quantity = rental days (4 days × ₱95 = ₱380).
    const addon = { id: 'addon-1', addonType: 'per_day', addonPrice: 95, quantity: 4, totalAmount: 380 };
    const addonSave = vi.fn();
    const deps = {
      orderRepo: { findById: vi.fn().mockResolvedValue(order), save: vi.fn() },
      orderItemRepo: { findByOrderId: vi.fn().mockResolvedValue([item]), save: vi.fn() },
      orderAddonRepo: { findByOrderId: vi.fn().mockResolvedValue([addon]), save: addonSave },
    };

    const result = await adjustDates(deps as never, {
      orderId: 'order-1', orderItemId: 'item-1',
      pickupDatetime: '2026-10-30T01:15:00.000Z', dropoffDatetime: '2026-11-04T08:45:00.000Z',
    });

    expect(result.newDays).toBe(6);
    expect(addonSave).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 570 }), 'store-1');
    expect(result.totalDelta).toBe(2 * 535 + 190);
  });
});
