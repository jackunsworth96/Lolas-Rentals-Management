import {
  MaintenanceRecord,
  Money,
  DomainError,
  type MaintenanceRepository,
  type FleetRepository,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import {
  createMaintenanceExpenseRpc,
  getStoreDefaultCashAccount,
} from '../../adapters/supabase/maintenance-expense-rpc.js';

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
  partsReplaced?: unknown | null;
  partsCost: number;
  laborCost: number;
  paidFrom?: string | null;
  expenseAccountId?: string | null;
  cashAccountId?: string | null;
}

function buildDescription(vehicleName: string | null, issue: string | null): string {
  const veh = vehicleName ?? 'Vehicle';
  const iss = (issue ?? '').slice(0, 50);
  return `Maintenance — ${veh} — ${iss}`;
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

  const partsCost = input.partsCost ?? 0;
  const laborCost = input.laborCost ?? 0;
  const totalCost = partsCost + laborCost;

  const resolvedCashAccountId = totalCost > 0
    ? (input.cashAccountId ?? input.paidFrom ?? await getStoreDefaultCashAccount(input.storeId))
    : null;

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
    partsReplaced: input.partsReplaced ?? null,
    partsCost: Money.php(partsCost),
    laborCost: Money.php(laborCost),
    totalCost: Money.php(totalCost),
    paidFrom: resolvedCashAccountId,
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

  if (input.startImmediately && vehicle.canAutoUpdateStatus()) {
    await deps.fleet.updateStatus(vehicle.id, 'Under Maintenance');
  }

  await deps.maintenance.save(record);

  if (totalCost > 0 && resolvedCashAccountId) {
    const expenseAccountId = input.expenseAccountId ?? resolvedCashAccountId;
    const description = buildDescription(record.vehicleName, record.issueDescription);

    await createMaintenanceExpenseRpc({
      expenseId: randomUUID(),
      maintenanceId: record.id,
      storeId: record.storeId,
      date: new Date().toISOString().split('T')[0],
      category: 'Maintenance',
      description,
      amount: totalCost,
      paidFrom: resolvedCashAccountId,
      vehicleId: record.assetId,
      employeeId: record.employeeId,
      expenseAccountId,
      cashAccountId: resolvedCashAccountId,
      jeDebitId: randomUUID(),
      jeCreditId: randomUUID(),
      transactionId: randomUUID(),
    });
  }

  return record;
}
