import {
  MaintenanceRecord,
  Money,
  type MaintenanceRepository,
  type FleetRepository,
  DomainError,
} from '@lolas/domain';
import {
  upsertMaintenanceExpensesRpc,
  getStoreDefaultCashAccount,
  getMaintenanceExpenseAccount,
} from '../../adapters/supabase/maintenance-expense-rpc.js';

export interface CompleteMaintenanceInput {
  maintenanceId: string;
  workPerformed: string;
  partsCost: number;
  laborCost: number;
  paidFrom: string | null;
  partsReplaced: unknown | null;
  nextServiceDue: number | null;
}

export interface CompleteMaintenanceResult {
  maintenanceId: string;
  vehicleId: string;
  totalCost: number;
  expenseId: string | null;
}

export async function completeMaintenance(
  input: CompleteMaintenanceInput,
  deps: {
    maintenance: MaintenanceRepository;
    fleet: FleetRepository;
  },
): Promise<CompleteMaintenanceResult> {
  const record = await deps.maintenance.findById(input.maintenanceId);
  if (!record) {
    throw new DomainError(`Maintenance record ${input.maintenanceId} not found`);
  }

  // Validates transition and updates status/workPerformed (mutates private fields)
  record.complete(input.workPerformed);

  const today = new Date().toISOString().split('T')[0];
  const totalCost = input.partsCost + input.laborCost;

  // Stamp downtime end and compute duration when tracked and still open
  let downtimeEnd = record.downtimeEnd;
  let totalDowntimeDays = record.totalDowntimeDays;
  if (record.downtimeTracked && record.downtimeStart && !record.downtimeEnd) {
    downtimeEnd = today;
    const ms = new Date(downtimeEnd).getTime() - new Date(record.downtimeStart).getTime();
    totalDowntimeDays = Math.max(1, Math.ceil(ms / 86_400_000));
  }

  // Rebuild with completed state + updated downtime (props are readonly on the entity)
  const completedRecord = MaintenanceRecord.create({
    id: record.id,
    assetId: record.assetId,
    vehicleName: record.vehicleName,
    status: record.status,
    downtimeTracked: record.downtimeTracked,
    downtimeStart: record.downtimeStart,
    downtimeEnd,
    totalDowntimeDays,
    issueDescription: record.issueDescription,
    workPerformed: record.workPerformed,
    partsReplaced: input.partsReplaced ?? record.partsReplaced,
    partsCost: Money.php(input.partsCost),
    laborCost: Money.php(input.laborCost),
    totalCost: Money.php(totalCost),
    paidFrom: input.paidFrom ?? record.paidFrom,
    mechanic: record.mechanic,
    odometer: record.odometer,
    nextServiceDue: input.nextServiceDue ?? record.nextServiceDue,
    nextServiceDueDate: record.nextServiceDueDate,
    opsNotes: record.opsNotes,
    employeeId: record.employeeId,
    storeId: record.storeId,
    createdAt: record.createdAt,
  });

  await deps.maintenance.save(completedRecord);

  // Only revert fleet status to Available when downtime was actually tracked
  if (record.downtimeTracked) {
    const vehicle = await deps.fleet.findById(record.assetId);
    if (vehicle && vehicle.canAutoUpdateStatus()) {
      await deps.fleet.updateStatus(vehicle.id, 'Available');
    }
  }

  if (totalCost > 0) {
    const cashAccountId = input.paidFrom ?? await getStoreDefaultCashAccount(completedRecord.storeId);
    if (cashAccountId) {
      const expenseAccountId =
        (await getMaintenanceExpenseAccount(completedRecord.storeId)) ?? cashAccountId;

      await upsertMaintenanceExpensesRpc({
        maintenanceId: completedRecord.id,
        storeId: completedRecord.storeId,
        date: today,
        vehicleId: completedRecord.assetId,
        employeeId: completedRecord.employeeId,
        partsCost: input.partsCost,
        laborCost: input.laborCost,
        cashAccountId,
        expenseAccountId,
        issueDescription: completedRecord.issueDescription ?? '',
      });
    }
  }

  return {
    maintenanceId: completedRecord.id,
    vehicleId: completedRecord.assetId,
    totalCost,
    expenseId: null,
  };
}
