import {
  type MaintenanceRepository,
  type FleetRepository,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import {
  createMaintenanceExpenseRpc,
  findExpenseByMaintenanceId,
  getStoreDefaultCashAccount,
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

  let expenseId: string | null = null;

  if (totalCost > 0) {
    const existing = await findExpenseByMaintenanceId(record.id);
    if (!existing) {
      const cashAccountId = input.paidFrom ?? await getStoreDefaultCashAccount(record.storeId);
      if (cashAccountId) {
        expenseId = randomUUID();
        const vehicleName = record.vehicleName ?? 'Vehicle';
        const issue = (record.issueDescription ?? '').slice(0, 50);
        const description = `Maintenance — ${vehicleName} — ${issue}`;

        await createMaintenanceExpenseRpc({
          expenseId,
          maintenanceId: record.id,
          storeId: record.storeId,
          date: new Date().toISOString().split('T')[0],
          category: 'Maintenance',
          description,
          amount: totalCost,
          paidFrom: cashAccountId,
          vehicleId: record.assetId,
          employeeId: record.employeeId,
          expenseAccountId: cashAccountId,
          cashAccountId,
          jeDebitId: randomUUID(),
          jeCreditId: randomUUID(),
          transactionId: randomUUID(),
        });
      }
    }
  }

  return {
    maintenanceId: record.id,
    vehicleId: record.assetId,
    totalCost,
    expenseId,
  };
}
