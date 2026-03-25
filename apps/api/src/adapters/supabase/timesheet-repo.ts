import { getSupabaseClient } from './client.js';
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
  return d.toISOString().slice(0, 10);
}

export function createTimesheetRepo(): TimesheetRepository {
  const sb = getSupabaseClient();

  return {
    async findByPeriod(storeId, period) {
      const { data, error } = await sb
        .from('timesheets')
        .select('*')
        .eq('store_id', storeId)
        .gte('date', dateStr(period.start))
        .lte('date', dateStr(period.end));
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
  };
}
