import { describe, expect, it, vi } from 'vitest';
import { submitDirectBooking } from '../src/use-cases/booking/submit-direct-booking.js';
import { computeQuote } from '../src/use-cases/booking/compute-quote.js';

vi.mock('../src/lib/partner-benefit.js', () => ({ lookupActivePartnerBySlug: vi.fn().mockResolvedValue(null) }));
vi.mock('../src/use-cases/booking/compute-quote.js', () => ({ computeQuote: vi.fn() }));

const input = {
  sessionToken: 'held', vehicleModelId: 'beat', storeId: 'store-lolas',
  pickupDatetime: '2026-10-14T09:00:00+08:00', dropoffDatetime: '2026-10-15T09:00:00+08:00',
  pickupLocationId: 1, dropoffLocationId: 1, webPaymentMethod: 'xendit',
};

function deps(methods: unknown = [{ id: 'xendit', isActive: true, gatewayProvider: 'xendit', surchargePercent: 3 }]) {
  const insertDirectBooking = vi.fn();
  return { insertDirectBooking, value: {
    bookingPort: { findActiveHold: vi.fn().mockResolvedValue({ id: 'hold' }),
      checkAvailability: vi.fn().mockResolvedValue([{ modelId: 'beat', availableCount: 1 }]),
      insertDirectBooking },
    configRepo: { getPaymentMethods: vi.fn().mockResolvedValue(methods) },
  } };
}

describe('Xendit direct booking quote', () => {
  it('does not insert when the quote fails', async () => {
    vi.mocked(computeQuote).mockRejectedValueOnce(new Error('no rate'));
    const { value, insertDirectBooking } = deps();
    await expect(submitDirectBooking(value as never, input as never)).rejects.toThrow('Card checkout quote');
    expect(insertDirectBooking).not.toHaveBeenCalled();
  });

  it('does not insert when the active method or surcharge config is unavailable', async () => {
    vi.mocked(computeQuote).mockResolvedValue({ rentalSubtotal: 500, pickupFee: 0,
      dropoffFee: 0, addonsTotal: 0 } as never);
    for (const methods of [[], [{ id: 'xendit', isActive: false, gatewayProvider: 'xendit', surchargePercent: 3 }]]) {
      const { value, insertDirectBooking } = deps(methods);
      await expect(submitDirectBooking(value as never, input as never)).rejects.toThrow('Card payment method');
      expect(insertDirectBooking).not.toHaveBeenCalled();
    }
    const { value, insertDirectBooking } = deps();
    vi.mocked(value.configRepo.getPaymentMethods).mockRejectedValueOnce(new Error('lookup failed'));
    await expect(submitDirectBooking(value as never, input as never)).rejects.toThrow('lookup failed');
    expect(insertDirectBooking).not.toHaveBeenCalled();
  });
});
