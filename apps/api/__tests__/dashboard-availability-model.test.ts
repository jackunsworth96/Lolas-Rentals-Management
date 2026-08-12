import { describe, expect, it } from 'vitest';
import { getDashboardAvailabilityModel } from '../src/lib/dashboard-availability-model.js';

describe('dashboard availability model grouping', () => {
  it('consolidates duplicate and legacy scooter model records under Honda Beat', () => {
    const rawModels = ['Honda Beat', 'Honda Beat V3', 'Yamaha Mio'];

    expect(rawModels.map(getDashboardAvailabilityModel)).toEqual([
      { modelId: 'honda-beat', modelName: 'Honda Beat', isScooter: true },
      { modelId: 'honda-beat', modelName: 'Honda Beat', isScooter: true },
      { modelId: 'honda-beat', modelName: 'Honda Beat', isScooter: true },
    ]);
  });

  it.each(['TukTuk (RE)', 'Bajaj RE', 'TVS King'])('groups %s under TukTuk', (name) => {
    expect(getDashboardAvailabilityModel(name)).toEqual({
      modelId: 'tuktuk',
      modelName: 'TukTuk',
      isScooter: false,
    });
  });
});
