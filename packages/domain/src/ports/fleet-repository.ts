import type { Vehicle } from '../entities/vehicle.js';

export interface FleetRepository {
  findById(id: string): Promise<Vehicle | null>;
  findAll(): Promise<Vehicle[]>;
  findByStore(storeId: string): Promise<Vehicle[]>;
  findAvailable(storeId: string, from: string, to: string): Promise<Vehicle[]>;
  save(vehicle: Vehicle): Promise<void>;
  updateStatus(vehicleId: string, status: string): Promise<void>;
  /**
   * @deprecated — superseded by post_batch_depreciation RPC.
   * Bare UPDATE was unsafe outside a transaction; depreciation writes must
   * be paired atomically with the journal entry insert. Kept on the port
   * for now to avoid an unrelated cascade; do not call from new code.
   */
  updateDepreciation(
    vehicleId: string,
    accumulatedDepreciation: number,
    bookValue: number,
  ): Promise<void>;
}
