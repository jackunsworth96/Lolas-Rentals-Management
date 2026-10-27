import { describe, expect, it } from 'vitest';
import { InvalidStatusTransitionError, Vehicle, type FleetRepository, type VehicleProps } from '@lolas/domain';
import { updateVehicle } from '../src/use-cases/fleet/update-vehicle.js';

function makeVehicle(status: string): Vehicle {
  const props: VehicleProps = {
    id: 'v-1',
    storeId: 'store-lolas',
    name: 'Bogart',
    modelId: 'TVS King TukTuk',
    plateNumber: null,
    gpsId: null,
    status,
    currentMileage: 0,
    orcrExpiryDate: null,
    surfRack: false,
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  return Vehicle.create(props);
}

function makeRepo(vehicle: Vehicle) {
  const saved: Vehicle[] = [];
  const repo = {
    findById: async (id: string) => (id === vehicle.id ? vehicle : null),
    save: async (v: Vehicle) => { saved.push(v); },
  } as unknown as FleetRepository;
  return { repo, saved };
}

describe('updateVehicle status lock', () => {
  it('allows a Closed vehicle to be put back to Available', async () => {
    const { repo, saved } = makeRepo(makeVehicle('Closed'));
    const result = await updateVehicle({ fleetRepo: repo }, { vehicleId: 'v-1', status: 'Available' });
    expect(result.status).toBe('Available');
    expect(saved).toHaveLength(1);
  });

  it('still blocks changing the status of a Sold vehicle', async () => {
    const { repo, saved } = makeRepo(makeVehicle('Sold'));
    await expect(
      updateVehicle({ fleetRepo: repo }, { vehicleId: 'v-1', status: 'Available' }),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(saved).toHaveLength(0);
  });

  it('allows non-status edits on a Sold vehicle', async () => {
    const { repo, saved } = makeRepo(makeVehicle('Sold'));
    const result = await updateVehicle({ fleetRepo: repo }, { vehicleId: 'v-1', owner: 'Jack' });
    expect(result.status).toBe('Sold');
    expect(saved).toHaveLength(1);
  });
});
