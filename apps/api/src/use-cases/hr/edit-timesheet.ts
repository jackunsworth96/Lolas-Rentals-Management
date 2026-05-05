import { getSupabaseClient } from '../../adapters/supabase/client.js';
import type { EditTimesheetRequest } from '@lolas/shared';

export interface EditTimesheetResult {
  id: string;
}

export async function editTimesheet(
  id: string,
  body: EditTimesheetRequest,
  amendedBy: string,
): Promise<EditTimesheetResult> {
  const sb = getSupabaseClient();

  const { data: existing, error: fetchErr } = await sb
    .from('timesheets')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    const err = Object.assign(new Error('Timesheet not found'), { statusCode: 404, code: 'NOT_FOUND' });
    throw err;
  }

  if (existing.payroll_status !== 'Pending') {
    const err = Object.assign(
      new Error(`Cannot edit a timesheet with status "${existing.payroll_status}"`),
      { statusCode: 409, code: 'NOT_EDITABLE' },
    );
    throw err;
  }

  const updates = {
    day_type: body.dayType,
    time_in: body.timeIn,
    time_out: body.timeOut,
    regular_hours: body.regularHours,
    overtime_hours: body.overtimeHours,
    nine_pm_returns_count: body.ninePmReturnsCount,
    daily_notes: body.dailyNotes,
    store_id: body.storeId,
  };

  const { error: updateErr } = await sb
    .from('timesheets')
    .update(updates)
    .eq('id', id)
    .eq('payroll_status', 'Pending');

  if (updateErr) throw new Error(`Failed to update timesheet: ${updateErr.message}`);

  const { error: logErr } = await sb
    .from('timesheet_amendment_logs')
    .insert({
      timesheet_id: id,
      amended_by: amendedBy,
      before_values: existing,
      after_values: { ...existing, ...updates },
    });

  if (logErr) throw new Error(`Failed to write amendment log: ${logErr.message}`);

  return { id };
}
