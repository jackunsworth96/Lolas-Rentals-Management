import {
  MaintenanceRecord,
  Money,
  DomainError,
  type MaintenanceRepository,
  type FleetRepository,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';
import {
  upsertMaintenanceExpensesRpc,
  getStoreDefaultCashAccount,
  getMaintenanceExpenseAccount,
} from '../../adapters/supabase/maintenance-expense-rpc.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface LogMaintenanceInput {
  assetId: string;
  issueDescription: string;
  mechanic: string | null;
  odometer: number | null;
  employeeId: string | null;
  storeId: string;
  downtimeStart: string | null;
  notes: string | null;
  partsReplaced?: unknown | null;
  partsCost: number;
  laborCost: number;
  paidFrom?: string | null;
  expenseAccountId?: string | null;
  cashAccountId?: string | null;
  expenseStatus?: 'paid' | 'unpaid';
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

  const downtimeStart = input.downtimeStart ?? formatManilaDate();
  const downtimeTracked = !!input.downtimeStart;

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

  if (downtimeTracked && vehicle.canAutoUpdateStatus()) {
    await deps.fleet.updateStatus(vehicle.id, 'Under Maintenance');
  }

  await deps.maintenance.save(record);

  const expenseStatus = input.expenseStatus ?? 'paid';

  // For unpaid expenses we still need an expense account but cashAccountId
  // may not be set — resolve a fallback so the RPC has a valid account_id.
  if (totalCost > 0 && (resolvedCashAccountId || expenseStatus === 'unpaid')) {
    const expenseAccountId =
      input.expenseAccountId ??
      (await getMaintenanceExpenseAccount(input.storeId)) ??
      resolvedCashAccountId ??
      '';

    const cashAccId =
      resolvedCashAccountId ??
      expenseAccountId;

    await upsertMaintenanceExpensesRpc({
      maintenanceId: record.id,
      storeId: record.storeId,
      date: formatManilaDate(),
      vehicleId: record.assetId,
      employeeId: record.employeeId,
      partsCost,
      laborCost,
      cashAccountId: cashAccId,
      expenseAccountId,
      issueDescription: input.issueDescription,
      expenseStatus,
    });
  }

  return record;
}
