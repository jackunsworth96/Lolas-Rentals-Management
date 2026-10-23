import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
}));

vi.mock('../src/use-cases/booking/check-availability.js', () => ({
  checkAvailability: mocks.checkAvailability,
}));

const { publicBookingRoutes } = await import('../src/routes/public-booking.js');

// Far enough in the future to always satisfy the 15-minute booking lead-time rule,
// regardless of when this test suite is actually executed.
const pickupDatetime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const dropoffDatetime = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

describe('GET /public/booking/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAvailability.mockResolvedValue([{ modelId: 'beat', modelName: 'Honda Beat', availableCount: 1 }]);
  });

  it('forwards excludeSessionToken from the query string to checkAvailability', async () => {
    const app = express();
    app.locals.deps = { bookingPort: {} };
    app.use('/api/public/booking', publicBookingRoutes);

    const response = await request(app)
      .get('/api/public/booking/availability')
      .query({
        storeId: 'store-lolas',
        pickupDatetime,
        dropoffDatetime,
        excludeSessionToken: 'session-abc',
      });

    expect(response.status).toBe(200);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeSessionToken: 'session-abc' }),
    );
  });

  it('omits excludeSessionToken when not provided by the caller', async () => {
    const app = express();
    app.locals.deps = { bookingPort: {} };
    app.use('/api/public/booking', publicBookingRoutes);

    const response = await request(app)
      .get('/api/public/booking/availability')
      .query({
        storeId: 'store-lolas',
        pickupDatetime,
        dropoffDatetime,
      });

    expect(response.status).toBe(200);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeSessionToken: undefined }),
    );
  });
});
