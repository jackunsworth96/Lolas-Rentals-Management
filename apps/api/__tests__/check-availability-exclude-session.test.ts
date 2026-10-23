import { describe, expect, it, vi } from 'vitest';
import { checkAvailability } from '../src/use-cases/booking/check-availability.js';
import type { BookingPort, AvailableModel } from '@lolas/domain';

function makeBookingPort(result: AvailableModel[]): BookingPort {
  return {
    checkAvailability: vi.fn(async () => result),
    insertHold: vi.fn(),
    deleteHold: vi.fn(),
    deleteHoldBySessionAndModel: vi.fn(),
    findActiveHoldsBySession: vi.fn(),
    findActiveHold: vi.fn(),
    insertDirectBooking: vi.fn(),
    isOrderReferenceUnique: vi.fn(),
  } as unknown as BookingPort;
}

describe('checkAvailability use-case', () => {
  it('forwards excludeSessionToken to the booking port', async () => {
    const bookingPort = makeBookingPort([{ modelId: 'beat', modelName: 'Honda Beat', availableCount: 1 }]);

    await checkAvailability(
      { bookingPort },
      {
        storeId: 'store-lolas',
        pickupDatetime: '2026-10-23T11:15:00+08:00',
        dropoffDatetime: '2026-10-26T16:45:00+08:00',
        excludeSessionToken: 'session-abc',
      },
    );

    expect(bookingPort.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSessionToken: 'session-abc' }),
    );
  });

  it('passes undefined excludeSessionToken when not provided (does not default to excluding nothing incorrectly)', async () => {
    const bookingPort = makeBookingPort([{ modelId: 'beat', modelName: 'Honda Beat', availableCount: 0 }]);

    await checkAvailability(
      { bookingPort },
      {
        storeId: 'store-lolas',
        pickupDatetime: '2026-10-23T11:15:00+08:00',
        dropoffDatetime: '2026-10-26T16:45:00+08:00',
      },
    );

    expect(bookingPort.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSessionToken: undefined }),
    );
  });
});
