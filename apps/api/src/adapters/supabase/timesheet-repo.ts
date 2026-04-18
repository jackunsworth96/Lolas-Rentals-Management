import { getSupabaseClient } from './client.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import type { TimesheetRepository } from '@lolas/domain';
import { Timesheet, type Period } from '@lolas/domain';

function toRow(t: Timesheet) {
  return {
    id: t.id,
    date: t.date,
    employee_id: t.employeeId,
    name: t.name,
    day_type: t.dayType,
    time_in: t.timeIn,
    time_out: t.timeOut,
    regular_hours: t.regularHours,
    overtime_hours: t.overtimeHours,
    nine_pm_returns_count: t.ninePmReturnsCount,
    daily_notes: t.dailyNotes,
    payroll_status: t.payrollStatus,
    sil_inflation: t.silInflation,
    store_id: t.storeId,
    created_at: t.createdAt.toISOString(),
  };
}

function toDomain(row: Record<string, unknown>): Timesheet {
  return Timesheet.create({
    id: row.id as string,
    date: row.date as string,
    employeeId: row.employee_id as string,
    name: row.name as string | null,
    dayType: row.day_type as string,
    timeIn: row.time_in as string | null,
    timeOut: row.time_out as string | null,
    regularHours: row.regular_hours as number,
    overtimeHours: row.overtime_hours as number,
    ninePmReturnsCount: row.nine_pm_returns_count as number,
    dailyNotes: row.daily_notes as string | null,
    payrollStatus: row.payroll_status as 'Pending' | 'Approved' | 'Paid',
    silInflation: row.sil_inflation as number,
    storeId: row.store_id as string,
    createdAt: new Date(row.created_at as string),
  });
}

function dateStr(d: Date): string {
  return formatManilaDate(d);
}

export function createTimesheetRepo(): TimesheetRepository {
  const sb = getSupabaseClient();

  return {
    async findByPeriod(storeId, period) {
      let query = sb
        .from('timesheets')
        .select('*')
        .gte('date', dateStr(period.start))
        .lte('date', dateStr(period.end));
      if (storeId) query = query.eq('store_id', storeId);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to fetch timesheets by period: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByEmployee(employeeId, period) {
      const { data, error } = await sb
        .from('timesheets')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('date', dateStr(period.start))
        .lte('date', dateStr(period.end));
      if (error) throw new Error(`Failed to fetch timesheets by employee: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(timesheet) {
      const { error } = await sb.from('timesheets').upsert(toRow(timesheet));
      if (error) throw new Error(`Failed to save timesheet: ${error.message}`);
    },

    async saveMany(timesheets) {
      const { error } = await sb.from('timesheets').upsert(timesheets.map(toRow));
      if (error) throw new Error(`Failed to save timesheets: ${error.message}`);
    },

    async bulkUpdateStatus(ids, status) {
      const { error } = await sb
        .from('timesheets')
        .update({ payroll_status: status })
        .in('id', ids);
      if (error) throw new Error(`Failed to bulk update timesheet status: ${error.message}`);
    },

    async runPayrollAtomic(
      transactions,
      timesheetIds,
      status,
      storeId,
      periodStart,
      periodEnd,
      runBy,
    ) {
      const { error } = await sb.rpc('run_payroll_atomic', {
        p_transactions:  transactions,
        p_timesheet_ids: timesheetIds,
        p_status:        status,
        p_store_id:      storeId,
        p_period_start:  periodStart,
        p_period_end:    periodEnd,
        p_notes:         runBy,
      });

      if (error) {
        // Preserve the SQLSTATE (e.g. '23505' for the payroll idempotency
        // unique_violation) so the route layer can map it to HTTP 409.
        const wrapped = new Error(
          `run_payroll_atomic RPC failed: ${error.message}`,
        ) as Error & { code?: string; details?: string; hint?: string };
        wrapped.code = error.code;
        wrapped.details = error.details;
        wrapped.hint = error.hint;
        throw wrapped;
      }
    },
  };
}
