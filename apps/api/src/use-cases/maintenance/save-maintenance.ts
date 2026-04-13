import {
  MaintenanceRecord,
  Money,
  DomainError,
  type MaintenanceRepository,
  type FleetRepository,
} from '@lolas/domain';
import {
  upsertMaintenanceExpensesRpc,
  deleteMaintenanceExpenseRpc,
  getStoreDefaultCashAccount,
  getMaintenanceExpenseAccount,
} from '../../adapters/supabase/maintenance-expense-rpc.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface SaveMaintenanceInput {
  assetId?: string;
  issueDescription?: string;
  status?: 'Reported' | 'In Progress' | 'Completed';
  mechanic?: string | null;
  odometer?: number | null;
  nextServiceDue?: number | null;
  nextServiceDueDate?: string | null;
  downtimeTracked?: boolean;
  downtimeStart?: string | null;
  downtimeEnd?: string | null;
  workPerformed?: string | null;
  partsReplaced?: unknown | null;
  partsCost?: number;
  laborCost?: number;
  paidFrom?: string | null;
  notes?: string | null;
  expenseAccountId?: string | null;
  cashAccountId?: string | null;
  expenseStatus?: 'paid' | 'unpaid';
}

export async function saveMaintenance(
  maintenanceId: string,
  input: SaveMaintenanceInput,
  deps: { maintenance: MaintenanceRepository; fleet: FleetRepository },
): Promise<MaintenanceRecord> {
  const existing = await deps.maintenance.findById(maintenanceId);
  if (!existing) {
    throw new DomainError(`Maintenance record ${maintenanceId} not found`);
  }

  const partsCost = input.partsCost ?? existing.partsCost.toNumber();
  const laborCost = input.laborCost ?? existing.laborCost.toNumber();
  const totalCost = partsCost + laborCost;

  let downtimeDays: number | null = existing.totalDowntimeDays;
  const dtStart = input.downtimeStart !== undefined ? input.downtimeStart : existing.downtimeStart;
  const dtEnd = input.downtimeEnd !== undefined ? input.downtimeEnd : existing.downtimeEnd;
  if (dtStart) {
    const endDate = dtEnd ? new Date(dtEnd) : new Date();
    downtimeDays = Math.max(1, Math.ceil((endDate.getTime() - new Date(dtStart).getTime()) / 86_400_000));
  }

  const updated = MaintenanceRecord.create({
    id: existing.id,
    assetId: input.assetId ?? existing.assetId,
    vehicleName: existing.vehicleName,
    status: input.status ?? existing.status,
    downtimeTracked: input.downtimeTracked ?? existing.downtimeTracked,
    downtimeStart: dtStart,
    downtimeEnd: dtEnd,
    totalDowntimeDays: downtimeDays,
    issueDescription: input.issueDescription ?? existing.issueDescription,
    workPerformed: input.workPerformed !== undefined ? input.workPerformed : existing.workPerformed,
    partsReplaced: input.partsReplaced !== undefined ? input.partsReplaced : existing.partsReplaced,
    partsCost: Money.php(partsCost),
    laborCost: Money.php(laborCost),
    totalCost: Money.php(totalCost),
    paidFrom: input.paidFrom !== undefined ? input.paidFrom : existing.paidFrom,
    mechanic: input.mechanic !== undefined ? input.mechanic : existing.mechanic,
    odometer: input.odometer !== undefined ? input.odometer : existing.odometer,
    nextServiceDue: input.nextServiceDue !== undefined ? input.nextServiceDue : existing.nextServiceDue,
    nextServiceDueDate: input.nextServiceDueDate !== undefined ? input.nextServiceDueDate : existing.nextServiceDueDate,
    opsNotes: input.notes !== undefined ? input.notes : existing.opsNotes,
    employeeId: existing.employeeId,
    storeId: existing.storeId,
    createdAt: existing.createdAt,
  });

  await deps.maintenance.save(updated);

  // ── Fleet status sync ──
  const statusChanged = input.status && input.status !== existing.status;
  if (statusChanged) {
    const vehicle = await deps.fleet.findById(updated.assetId);
    if (vehicle && vehicle.canAutoUpdateStatus()) {
      if (input.status === 'In Progress') {
        await deps.fleet.updateStatus(vehicle.id, 'Under Maintenance');
      } else if (input.status === 'Completed') {
        await deps.fleet.updateStatus(vehicle.id, 'Available');
      }
    }
  }

  // ── Expense + journal entry management ──
  const expenseStatus = input.expenseStatus ?? 'paid';

  const resolvedPaidFrom =
    input.cashAccountId ??
    (input.paidFrom !== undefined ? input.paidFrom : existing.paidFrom) ??
    (expenseStatus === 'unpaid' ? null : await getStoreDefaultCashAccount(updated.storeId));

  if (totalCost > 0 && (resolvedPaidFrom || expenseStatus === 'unpaid')) {
    const expenseAccountId =
      input.expenseAccountId ??
      (await getMaintenanceExpenseAccount(updated.storeId)) ??
      resolvedPaidFrom ??
      '';

    const cashAccountId = resolvedPaidFrom ?? expenseAccountId;

    await upsertMaintenanceExpensesRpc({
      maintenanceId,
      storeId: updated.storeId,
      date: formatManilaDate(),
      vehicleId: updated.assetId,
      employeeId: updated.employeeId,
      partsCost,
      laborCost,
      cashAccountId,
      expenseAccountId,
      issueDescription: updated.issueDescription ?? '',
      expenseStatus,
    });
  } else if (totalCost === 0) {
    await deleteMaintenanceExpenseRpc(maintenanceId);
  }

  return updated;
}
