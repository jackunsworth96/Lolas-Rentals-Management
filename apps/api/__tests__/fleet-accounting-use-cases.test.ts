import { describe, expect, it, vi } from 'vitest';
import { Vehicle, type VehicleProps } from '@lolas/domain';
import { recordPurchase, type RecordPurchaseDeps } from '../src/use-cases/fleet/record-purchase.js';
import { recordSale, type RecordSaleDeps } from '../src/use-cases/fleet/record-sale.js';

function vehicle(overrides: Partial<VehicleProps> = {}) {
  return Vehicle.create({
    id: 'beat-1',
    storeId: 'store-lolas',
    name: 'Honda Beat',
    modelId: 'beat',
    plateNumber: null,
    gpsId: null,
    status: 'Available',
    currentMileage: 0,
    orcrExpiryDate: null,
    surfRack: true,
    owner: null,
    rentableStartDate: null,
    registrationDate: null,
    purchasePrice: null,
    purchaseDate: null,
    setUpCosts: 0,
    totalBikeCost: 0,
    usefulLifeMonths: null,
    salvageValue: 0,
    accumulatedDepreciation: 0,
    bookValue: 0,
    dateSold: null,
    soldPrice: null,
    profitLoss: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('fleet accounting cost basis', () => {
  it('separates reusable setup assets and initializes bike book value at purchase price', async () => {
    const existing = vehicle();
    const save = vi.fn();
    const createTransaction = vi.fn().mockResolvedValue({});
    const deps = {
      fleetRepo: { findById: vi.fn().mockResolvedValue(existing), save },
      accountingPort: { createTransaction },
    } as unknown as RecordPurchaseDeps;

    const result = await recordPurchase(deps, {
      vehicleId: existing.id,
      purchasePrice: 75122,
      purchaseDate: '2026-07-01',
      setUpCosts: 7000,
      usefulLifeMonths: 36,
      salvageValue: 35000,
      fixedAssetAccountId: 'vehicles',
      setupAssetAccountId: 'reusable-equipment',
      cashAccountId: 'cash',
    });

    expect(result.bookValue).toBe(75122);
    expect(result.totalBikeCost).toBe(82122);
    const legs = createTransaction.mock.calls[0][0];
    expect(legs.map((leg: { accountId: string; debit: { toNumber(): number }; credit: { toNumber(): number } }) => ({
      accountId: leg.accountId,
      debit: leg.debit.toNumber(),
      credit: leg.credit.toNumber(),
    }))).toEqual([
      { accountId: 'vehicles', debit: 75122, credit: 0 },
      { accountId: 'reusable-equipment', debit: 7000, credit: 0 },
      { accountId: 'cash', debit: 0, credit: 82122 },
    ]);
  });

  it('disposes only the bike purchase price and leaves reusable setup assets on the books', async () => {
    const existing = vehicle({
      purchasePrice: 75122,
      purchaseDate: '2025-01-01',
      setUpCosts: 7000,
      totalBikeCost: 82122,
      usefulLifeMonths: 36,
      salvageValue: 35000,
      accumulatedDepreciation: 10000,
      bookValue: 65122,
    });
    const createTransaction = vi.fn().mockResolvedValue({});
    const deps = {
      fleetRepo: { findById: vi.fn().mockResolvedValue(existing), save: vi.fn() },
      accountingPort: { createTransaction },
    } as unknown as RecordSaleDeps;

    await recordSale(deps, {
      vehicleId: existing.id,
      salePrice: 60000,
      saleDate: '2026-07-31',
      cashAccountId: 'cash',
      fixedAssetAccountId: 'vehicles',
      accDepreciationAccountId: 'acc-dep',
      gainLossAccountId: 'gain-loss',
    });

    const assetLeg = createTransaction.mock.calls[0][0].find(
      (leg: { accountId: string }) => leg.accountId === 'vehicles',
    );
    expect(assetLeg.credit.toNumber()).toBe(75122);
  });
});
