import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vehicle, type VehicleProps } from '@lolas/domain';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/adapters/supabase/client.js', () => ({ supabase: { rpc } }));

import { batchDepreciation, type BatchDepreciationDeps } from '../src/use-cases/fleet/batch-depreciation.js';

function hondaBeat() {
  return Vehicle.create({
    id: 'beat-1', storeId: 'store-lolas', name: 'Honda Beat', modelId: 'beat',
    plateNumber: null, gpsId: null, status: 'Available', currentMileage: 0,
    orcrExpiryDate: null, surfRack: true, owner: null, rentableStartDate: null,
    registrationDate: null, purchasePrice: 75122, purchaseDate: '2026-01-01',
    setUpCosts: 7000, totalBikeCost: 82122, usefulLifeMonths: 36,
    salvageValue: 35000, accumulatedDepreciation: 0, bookValue: 75122,
    dateSold: null, soldPrice: null, profitLoss: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  } satisfies VehicleProps);
}

const input = {
  storeId: 'store-lolas',
  period: '2026-07',
  depreciationExpenseAccountId: 'dep-expense',
  accDepreciationAccountId: 'acc-dep',
};

describe('batchDepreciation', () => {
  beforeEach(() => rpc.mockReset());

  it('posts purchase-price depreciation at period end', async () => {
    rpc.mockResolvedValue({
      data: {
        run_id: 'run-1', transaction_id: 'tx-1', vehicle_count: 1,
        total_depreciation: 1114.5, already_posted: false,
      },
      error: null,
    });
    const deps = { fleetRepo: { findByStore: vi.fn().mockResolvedValue([hondaBeat()]) } } as unknown as BatchDepreciationDeps;

    const result = await batchDepreciation(deps, input);

    expect(result.entries[0].amount).toBe(1114.5);
    expect(rpc).toHaveBeenCalledWith('post_batch_depreciation', expect.objectContaining({
      p_journal_entry_date: '2026-07-31',
      p_store_id: 'store-lolas',
      p_vehicle_records: [expect.objectContaining({ depreciation_amount: 1114.5 })],
    }));
  });

  it('returns the existing run when the store-period has already posted', async () => {
    rpc.mockResolvedValue({
      data: {
        run_id: 'run-existing', transaction_id: 'tx-existing', vehicle_count: 1,
        total_depreciation: 1114.5, already_posted: true,
      },
      error: null,
    });
    const deps = { fleetRepo: { findByStore: vi.fn().mockResolvedValue([hondaBeat()]) } } as unknown as BatchDepreciationDeps;

    const result = await batchDepreciation(deps, input);

    expect(result.status).toBe('already_posted');
    expect(result.entries).toEqual([]);
    expect(result.runId).toBe('run-existing');
  });
});
