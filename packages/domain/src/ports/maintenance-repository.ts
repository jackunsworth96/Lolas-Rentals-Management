import type { MaintenanceRecord } from '../entities/maintenance-record.js';

export interface MaintenanceFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  mechanic?: string;
}

export interface MaintenanceRepository {
  findById(id: string): Promise<MaintenanceRecord | null>;
  findByVehicle(vehicleId: string): Promise<MaintenanceRecord[]>;
  findByStore(
    storeId: string,
    filters?: MaintenanceFilters,
  ): Promise<MaintenanceRecord[]>;
  save(record: MaintenanceRecord): Promise<void>;
  deleteById(id: string): Promise<void>;
}
