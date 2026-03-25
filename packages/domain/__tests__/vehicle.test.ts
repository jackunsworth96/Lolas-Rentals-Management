import { describe, it, expect } from 'vitest';
import { Vehicle, type VehicleProps } from '../src/entities/vehicle.js';

function makeVehicleProps(overrides: Partial<VehicleProps> = {}): VehicleProps {
  return {
    id: 'v-1',
    storeId: 'store-1',
    name: 'Honda Click 125',
    modelId: 'model-1',
    plateNumber: 'ABC-1234',
    gpsId: null,
    status: 'Available',
    currentMileage: 5000,
    orcrExpiryDate: null,
    surfRack: false,
    owner: null,
    rentableStartDate: '2024-01-01',
    registrationDate: '2023-06-15',
    purchasePrice: 80000,
    purchaseDate: '2023-06-01',
    setUpCosts: 5000,
    totalBikeCost: 85000,
    usefulLifeMonths: 60,
    salvageValue: 10000,
    accumulatedDepreciation: 0,
    bookValue: 85000,
    dateSold: null,
    soldPrice: null,
    profitLoss: null,
    createdAt: new Date('2023-06-01'),
    updatedAt: new Date('2023-06-01'),
    ...overrides,
  };
}

describe('Vehicle', () => {
  describe('isRentable', () => {
    it('returns true for Available status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Available' }));
      expect(v.isRentable()).toBe(true);
    });

    it('returns false for Sold status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Sold' }));
      expect(v.isRentable()).toBe(false);
    });

    it('returns false for Closed status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Closed' }));
      expect(v.isRentable()).toBe(false);
    });

    it('returns false for Maintenance status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Maintenance' }));
      expect(v.isRentable()).toBe(false);
    });

    it('returns false for Retired status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Retired' }));
      expect(v.isRentable()).toBe(false);
    });

    it('returns true for Rented status', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Rented' }));
      expect(v.isRentable()).toBe(true);
    });
  });

  describe('isProtected', () => {
    it('returns true for Sold', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Sold' }));
      expect(v.isProtected()).toBe(true);
    });

    it('returns true for Closed', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Closed' }));
      expect(v.isProtected()).toBe(true);
    });

    it('returns false for Available', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Available' }));
      expect(v.isProtected()).toBe(false);
    });

    it('returns false for Maintenance', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Maintenance' }));
      expect(v.isProtected()).toBe(false);
    });
  });

  describe('canAutoUpdateStatus', () => {
    it('returns true when not protected', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Available' }));
      expect(v.canAutoUpdateStatus()).toBe(true);
    });

    it('returns false when protected (Sold)', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Sold' }));
      expect(v.canAutoUpdateStatus()).toBe(false);
    });

    it('returns false when protected (Closed)', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Closed' }));
      expect(v.canAutoUpdateStatus()).toBe(false);
    });
  });

  describe('applyDepreciation', () => {
    it('updates book value correctly', () => {
      const v = Vehicle.create(
        makeVehicleProps({
          totalBikeCost: 85000,
          accumulatedDepreciation: 0,
          bookValue: 85000,
          salvageValue: 10000,
        }),
      );
      v.applyDepreciation(5000);
      expect(v.accumulatedDepreciation).toBe(5000);
      expect(v.bookValue).toBe(80000);
    });

    it('does not reduce book value below salvage value', () => {
      const v = Vehicle.create(
        makeVehicleProps({
          totalBikeCost: 85000,
          accumulatedDepreciation: 70000,
          bookValue: 15000,
          salvageValue: 10000,
        }),
      );
      v.applyDepreciation(20000);
      expect(v.bookValue).toBe(10000);
      expect(v.accumulatedDepreciation).toBe(75000);
    });

    it('clamps exactly to salvage when depreciation matches remaining', () => {
      const v = Vehicle.create(
        makeVehicleProps({
          totalBikeCost: 85000,
          accumulatedDepreciation: 70000,
          bookValue: 15000,
          salvageValue: 10000,
        }),
      );
      v.applyDepreciation(5000);
      expect(v.bookValue).toBe(10000);
      expect(v.accumulatedDepreciation).toBe(75000);
    });

    it('throws when vehicle is protected', () => {
      const v = Vehicle.create(makeVehicleProps({ status: 'Sold' }));
      expect(() => v.applyDepreciation(1000)).toThrow();
    });

    it('allows depreciation on non-protected statuses', () => {
      const v = Vehicle.create(
        makeVehicleProps({
          status: 'Maintenance',
          totalBikeCost: 85000,
          accumulatedDepreciation: 0,
          bookValue: 85000,
          salvageValue: 10000,
        }),
      );
      v.applyDepreciation(1000);
      expect(v.bookValue).toBe(84000);
    });
  });
});
