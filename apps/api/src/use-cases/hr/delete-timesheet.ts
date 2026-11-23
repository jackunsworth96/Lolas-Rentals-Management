import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { recalculateLeaveUsed } from './leave-usage.js';

export interface DeleteTimesheetResult {
  id: string;
  employeeId: string;
}

function httpError(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

/** Deletes a Pending timesheet row, keeping a copy and the reason in timesheet_deletions. */
export async function deleteTimesheet(id: string, reason: string, deletedBy: string): Promise<DeleteTimesheetResult> {
  const sb = getSupabaseClient();
  const { data: existing, error: fetchErr } = await sb.from('timesheets').select('*').eq('id', id).maybeSingle();
  if (fetchErr) throw new Error(`Failed to load timesheet: ${fetchErr.message}`);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Timesheet not found');
  if (existing.payroll_status !== 'Pending') {
    throw httpError(409, 'NOT_DELETABLE', `Only pending timesheets can be deleted; this one is ${String(existing.payroll_status).toLowerCase()}. Edit it instead.`);
  }

  // An old 9pm till payout linked to this row is removed with it (amount 0 clears it).
  const { data: payout } = await sb.from('expenses').select('id').eq('timesheet_id', id).maybeSingle();
  if (payout) {
    const { error } = await sb.rpc('sync_nine_pm_payout', {
      p: { timesheetId: id, amount: 0, date: existing.date, employeeId: existing.employee_id, storeId: existing.store_id, count: 0 },
    });
    if (error) throw new Error(`Failed to remove the 9pm payout: ${error.message}`);
  }

  const { data: log, error: logErr } = await sb.from('timesheet_deletions').insert({
    timesheet_id: id,
    employee_id: existing.employee_id,
    date: existing.date,
    store_id: existing.store_id ?? null,
    deleted_by: deletedBy,
    reason,
    row_snapshot: existing,
  }).select('id').single();
  if (logErr || !log) throw new Error(`Failed to record the deletion: ${logErr?.message ?? 'no row'}`);

  const { data: deleted, error: delErr } = await sb.from('timesheets').delete().eq('id', id).eq('payroll_status', 'Pending').select('id');
  if (delErr || !deleted || deleted.length === 0) {
    await sb.from('timesheet_deletions').delete().eq('id', log.id);
    if (delErr) throw new Error(`Failed to delete timesheet: ${delErr.message}`);
    throw httpError(409, 'NOT_DELETABLE', 'This timesheet was approved while you were deleting it');
  }

  await recalculateLeaveUsed([String(existing.employee_id)]);
  return { id, employeeId: String(existing.employee_id) };
}
