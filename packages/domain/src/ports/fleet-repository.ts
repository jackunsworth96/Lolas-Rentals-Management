import type { Vehicle } from '../entities/vehicle.js';

export interface FleetRepository {
  findById(id: string): Promise<Vehicle | null>;
  findAll(): Promise<Vehicle[]>;
  findByStore(storeId: string): Promise<Vehicle[]>;
  findAvailable(storeId: string, from: string, to: string): Promise<Vehicle[]>;
  save(vehicle: Vehicle): Promise<void>;
  updateStatus(vehicleId: string, status: string): Promise<void>;
  updateDepreciation(
    vehicleId: string,
    accumulatedDepreciation: number,
    bookValue: number,
  ): Promise<void>;
}
