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
  updateMaintenanceExpenseRpc,
  deleteMaintenanceExpenseRpc,
  findExpenseByMaintenanceId,
  getStoreDefaultCashAccount,
} from '../../adapters/supabase/maintenance-expense-rpc.js';

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
}

function buildDescription(vehicleName: string | null, issue: string | null): string {
  const veh = vehicleName ?? 'Vehicle';
  const iss = (issue ?? '').slice(0, 50);
  return `Maintenance — ${veh} — ${iss}`;
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
  const oldTotalCost = existing.totalCost.toNumber();

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

  // ── Atomic expense + journal entry management ──
  const linkedExpense = await findExpenseByMaintenanceId(maintenanceId);
  const description = buildDescription(updated.vehicleName, updated.issueDescription);

  if (totalCost > 0) {
    const cashAccountId = input.cashAccountId
      ?? (input.paidFrom !== undefined ? input.paidFrom : existing.paidFrom)
      ?? await getStoreDefaultCashAccount(updated.storeId);

    if (cashAccountId) {
      const expenseAccountId = input.expenseAccountId ?? cashAccountId;

      if (linkedExpense) {
        if (totalCost !== oldTotalCost || input.paidFrom !== undefined) {
          await updateMaintenanceExpenseRpc({
            expenseId: linkedExpense.id,
            amount: totalCost,
            description,
            expenseAccountId,
            cashAccountId,
            jeDebitId: randomUUID(),
            jeCreditId: randomUUID(),
            transactionId: randomUUID(),
          });
        }
      } else {
        await createMaintenanceExpenseRpc({
          expenseId: randomUUID(),
          maintenanceId,
          storeId: updated.storeId,
          date: new Date().toISOString().split('T')[0],
          category: 'Maintenance',
          description,
          amount: totalCost,
          paidFrom: cashAccountId,
          vehicleId: updated.assetId,
          employeeId: updated.employeeId,
          expenseAccountId,
          cashAccountId,
          jeDebitId: randomUUID(),
          jeCreditId: randomUUID(),
          transactionId: randomUUID(),
        });
      }
    }
  } else if (totalCost === 0 && linkedExpense) {
    await deleteMaintenanceExpenseRpc(maintenanceId);
  }

  return updated;
}
