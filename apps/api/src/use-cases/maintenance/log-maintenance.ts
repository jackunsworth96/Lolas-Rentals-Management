import {
  MaintenanceRecord,
  Money,
  DomainError,
  type MaintenanceRepository,
  type FleetRepository,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface LogMaintenanceInput {
  assetId: string;
  issueDescription: string;
  mechanic: string | null;
  odometer: number | null;
  employeeId: string | null;
  storeId: string;
  startImmediately: boolean;
  downtimeStart: string | null;
  notes: string | null;
}

export async function logMaintenance(
  input: LogMaintenanceInput,
  deps: { maintenance: MaintenanceRepository; fleet: FleetRepository },
): Promise<MaintenanceRecord> {
  const vehicle = await deps.fleet.findById(input.assetId);
  if (!vehicle) {
    throw new DomainError(`Vehicle ${input.assetId} not found`);
  }

  const downtimeStart = input.downtimeStart ?? new Date().toISOString().split('T')[0];
  const downtimeTracked = !!input.downtimeStart || input.startImmediately;

  const record = MaintenanceRecord.create({
    id: randomUUID(),
    assetId: input.assetId,
    vehicleName: vehicle.name,
    status: 'Reported',
    downtimeTracked,
    downtimeStart: downtimeTracked ? downtimeStart : null,
    downtimeEnd: null,
    totalDowntimeDays: null,
    issueDescription: input.issueDescription,
    workPerformed: null,
    partsReplaced: null,
    partsCost: Money.zero(),
    laborCost: Money.zero(),
    totalCost: Money.zero(),
    paidFrom: null,
    mechanic: input.mechanic,
    odometer: input.odometer,
    nextServiceDue: null,
    nextServiceDueDate: null,
    opsNotes: input.notes,
    employeeId: input.employeeId,
    storeId: input.storeId,
    createdAt: new Date(),
  });

  if (input.startImmediately) {
    record.startWork();
  }

  if (vehicle.canAutoUpdateStatus()) {
    await deps.fleet.updateStatus(vehicle.id, 'Under Maintenance');
  }

  await deps.maintenance.save(record);
  return record;
}
