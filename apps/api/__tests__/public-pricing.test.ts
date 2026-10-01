import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { publicBookingRoutes } from '../src/routes/public-booking.js';

describe('public vehicle pricing', () => {
  it('returns a simple ordered price list for models in the Lola fleet', async () => {
    const app = express();
    app.locals.deps = {
      configRepo: {
        getVehicleModels: async () => [
          { id: 'beat', name: 'Honda Beat' },
          { id: 'unused', name: 'Unused model' },
          { id: 'unpriced', name: 'Unpriced model' },
        ],
        getStorePricing: async (storeId: string) => {
          expect(storeId).toBe('store-lolas');
          return [
            { modelId: 'beat', minDays: 7, maxDays: 999, dailyRate: '500.00' },
            { modelId: 'unused', minDays: 1, maxDays: 2, dailyRate: '600.00' },
            { modelId: 'beat', minDays: 1, maxDays: 2, dailyRate: '700.00' },
          ];
        },
      },
      fleetRepo: {
        findByStore: async (storeId: string) => {
          expect(storeId).toBe('store-lolas');
          return [{ modelId: 'beat' }, { modelId: 'unpriced' }];
        },
      },
    };
    app.use('/api/public/booking', publicBookingRoutes);

    const response = await request(app).get('/api/public/booking/pricing');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      currency: 'PHP',
      vehicles: [{
        model: 'Honda Beat',
        rates: [
          { minDays: 1, maxDays: 2, dailyRate: 700 },
          { minDays: 7, maxDays: 999, dailyRate: 500 },
        ],
      }],
    });
  });
});
