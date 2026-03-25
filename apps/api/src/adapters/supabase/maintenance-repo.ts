import { getSupabaseClient } from './client.js';
import type { MaintenanceRepository, MaintenanceFilters } from '@lolas/domain';
import { MaintenanceRecord, Money } from '@lolas/domain';

function toRow(r: MaintenanceRecord) {
  return {
    id: r.id,
    asset_id: r.assetId,
    vehicle_name: r.vehicleName,
    status: r.status,
    downtime_tracked: r.downtimeTracked,
    downtime_start: r.downtimeStart,
    downtime_end: r.downtimeEnd,
    total_downtime_days: r.totalDowntimeDays,
    issue_description: r.issueDescription,
    work_performed: r.workPerformed,
    parts_replaced: r.partsReplaced,
    parts_cost: r.partsCost.toNumber(),
    labor_cost: r.laborCost.toNumber(),
    total_cost: r.totalCost.toNumber(),
    paid_from: r.paidFrom,
    mechanic: r.mechanic,
    odometer: r.odometer,
    next_service_due: r.nextServiceDue,
    next_service_due_date: r.nextServiceDueDate,
    ops_notes: r.opsNotes,
    employee_id: r.employeeId,
    store_id: r.storeId,
    created_at: r.createdAt.toISOString(),
  };
}

function toDomain(row: Record<string, unknown>): MaintenanceRecord {
  return MaintenanceRecord.create({
    id: row.id as string,
    assetId: row.asset_id as string,
    vehicleName: row.vehicle_name as string | null,
    status: row.status as 'Reported' | 'In Progress' | 'Completed',
    downtimeTracked: row.downtime_tracked as boolean,
    downtimeStart: row.downtime_start as string | null,
    downtimeEnd: row.downtime_end as string | null,
    totalDowntimeDays: row.total_downtime_days as number | null,
    issueDescription: row.issue_description as string | null,
    workPerformed: row.work_performed as string | null,
    partsReplaced: row.parts_replaced,
    partsCost: Money.php(row.parts_cost as number),
    laborCost: Money.php(row.labor_cost as number),
    totalCost: Money.php(row.total_cost as number),
    paidFrom: row.paid_from as string | null,
    mechanic: row.mechanic as string | null,
    odometer: row.odometer as number | null,
    nextServiceDue: row.next_service_due as number | null,
    nextServiceDueDate: row.next_service_due_date as string | null,
    opsNotes: row.ops_notes as string | null,
    employeeId: row.employee_id as string | null,
    storeId: row.store_id as string,
    createdAt: new Date(row.created_at as string),
  });
}

export function createMaintenanceRepo(): MaintenanceRepository {
  const sb = getSupabaseClient();

  return {
    async findById(id) {
      const { data, error } = await sb
        .from('maintenance')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch maintenance record: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async findByVehicle(vehicleId) {
      const { data, error } = await sb
        .from('maintenance')
        .select('*')
        .eq('asset_id', vehicleId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Failed to fetch maintenance by vehicle: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByStore(storeId, filters?) {
      let query = sb.from('maintenance').select('*').eq('store_id', storeId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);
      if (filters?.mechanic) query = query.eq('mechanic', filters.mechanic);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw new Error(`Failed to fetch maintenance records: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(record) {
      const { error } = await sb.from('maintenance').upsert(toRow(record));
      if (error) throw new Error(`Failed to save maintenance record: ${error.message}`);
    },

    async deleteById(id) {
      const { error } = await sb.from('maintenance').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete maintenance record: ${error.message}`);
    },
  };
}
