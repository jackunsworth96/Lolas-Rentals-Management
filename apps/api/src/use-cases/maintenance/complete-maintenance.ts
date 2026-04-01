import {
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

  record.complete(input.workPerformed);

  const totalCost = input.partsCost + input.laborCost;

  const vehicle = await deps.fleet.findById(record.assetId);
  if (vehicle && vehicle.canAutoUpdateStatus()) {
    await deps.fleet.updateStatus(vehicle.id, 'Available');
  }

  await deps.maintenance.save(record);

  if (totalCost > 0) {
    const cashAccountId = input.paidFrom ?? await getStoreDefaultCashAccount(record.storeId);
    if (cashAccountId) {
      const expenseAccountId =
        (await getMaintenanceExpenseAccount(record.storeId)) ?? cashAccountId;

      await upsertMaintenanceExpensesRpc({
        maintenanceId: record.id,
        storeId: record.storeId,
        date: new Date().toISOString().split('T')[0],
        vehicleId: record.assetId,
        employeeId: record.employeeId,
        partsCost: input.partsCost,
        laborCost: input.laborCost,
        cashAccountId,
        expenseAccountId,
        issueDescription: record.issueDescription ?? '',
      });
    }
  }

  return {
    maintenanceId: record.id,
    vehicleId: record.assetId,
    totalCost,
    expenseId: null,
  };
}
