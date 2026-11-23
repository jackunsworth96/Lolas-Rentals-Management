import {
  DomainError,
  Timesheet,
  planTimesheetRow,
  rotaWeekStart,
  type PlannedTimesheetRow,
  type TimesheetRepository,
} from '@lolas/domain';
import type { SendRotaToTimesheetsRequest } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';
import {
  assertApprover,
  audit,
  getRotaWeek,
  loadWeekState,
  type RotaViewer,
  type RotaWeekView,
  type WeekState,
} from './rota.js';

type Row = Record<string, unknown>;

export interface TimesheetPreviewLine {
  employeeId: string;
  name: string;
  date: string;
  action: 'create' | 'update' | 'skip';
  reason: string | null;
  row: PlannedTimesheetRow | null;
  existingId: string | null;
  existingStatus: 'Pending' | 'Approved' | 'Paid' | null;
}

export interface SendToTimesheetsResult {
  created: number;
  updated: number;
  skipped: number;
  week: RotaWeekView;
}

function sendableDates(state: WeekState, only?: string[]): string[] {
  const today = formatManilaDate();
  return state.dates.filter((d) => d <= today && (!only || only.includes(d)));
}

export function buildTimesheetPlan(state: WeekState, dates: string[]): TimesheetPreviewLine[] {
  const lines: TimesheetPreviewLine[] = [];
  for (const date of dates) {
    const assignee = state.ninePmDuty.get(date) ?? null;
    const ninePmCount = state.ninePm.get(date)?.length ?? 0;
    for (const p of state.people) {
      const key = `${p.employeeId}|${date}`;
      const cell = state.cells.get(key);
      const ts = state.timesheets.get(key) ?? null;
      const result = planTimesheetRow({
        kind: cell?.kind ?? null,
        startTime: cell?.startTime ?? null,
        endTime: cell?.endTime ?? null,
        actual: cell?.actual ?? null,
        ninePmAssignee: assignee === p.employeeId,
        ninePmCount,
        existing: ts,
      });
      lines.push({
        employeeId: p.employeeId,
        name: p.name,
        date,
        action: result.action,
        reason: result.action === 'skip' ? result.reason : null,
        row: result.row,
        existingId: ts?.id ?? null,
        existingStatus: ts?.payrollStatus ?? null,
      });
    }
  }
  return lines;
}

/**
 * Drops lines whose timesheet changed since the plan was built: a create where a
 * row now exists, or an update whose row is gone or no longer Pending. Approved
 * and Paid rows are never written from the rota.
 */
export function filterWritableLines(lines: TimesheetPreviewLine[], fresh: ReadonlyMap<string, { id: string; payrollStatus: string }>): TimesheetPreviewLine[] {
  return lines.filter((l) => {
    const now = fresh.get(`${l.employeeId}|${l.date}`);
    if (l.action === 'create') return !now;
    if (l.action === 'update') return !!now && now.id === l.existingId && now.payrollStatus === 'Pending';
    return false;
  });
}

/** Rows for the manual timesheet form on one date: everyone the rota would send. */
export async function prefillTimesheetsFromRota(storeId: string, date: string): Promise<TimesheetPreviewLine[]> {
  const state = await loadWeekState(storeId, rotaWeekStart(date));
  return buildTimesheetPlan(state, [date]).filter((l) => l.action !== 'skip');
}

export async function previewRotaTimesheets(storeId: string, viewer: RotaViewer, weekStart: string): Promise<TimesheetPreviewLine[]> {
  const state = await loadWeekState(storeId, weekStart);
  assertApprover(state.settings, viewer);
  return buildTimesheetPlan(state, sendableDates(state));
}

export async function sendRotaToTimesheets(
  storeId: string,
  viewer: RotaViewer,
  userId: string,
  input: SendRotaToTimesheetsRequest,
  deps: { timesheets: TimesheetRepository },
): Promise<SendToTimesheetsResult> {
  const state = await loadWeekState(storeId, input.weekStart);
  assertApprover(state.settings, viewer);
  if (state.status === 'locked') throw new DomainError('This week is locked because payroll has run');
  const dates = sendableDates(state, input.dates);
  if (dates.length === 0) throw new DomainError('There are no days up to today to send');

  const plan = buildTimesheetPlan(state, dates);
  const candidates = plan.filter((l) => l.action !== 'skip');
  const employeeIds = [...new Set(candidates.map((l) => l.employeeId))];

  const fresh = new Map<string, { id: string; payrollStatus: string; storeId: string }>();
  if (employeeIds.length > 0) {
    const { data, error } = await getSupabaseClient().from('timesheets')
      .select('id, employee_id, date, payroll_status, store_id')
      .in('employee_id', employeeIds).in('date', dates);
    if (error) throw new Error(`Failed to check timesheets: ${error.message}`);
    for (const r of (data ?? []) as Row[]) {
      fresh.set(`${r.employee_id}|${r.date}`, { id: String(r.id), payrollStatus: String(r.payroll_status), storeId: String(r.store_id) });
    }
  }
  const writable = filterWritableLines(candidates, fresh);
  const creates = writable.filter((l) => l.action === 'create');
  const updates = writable.filter((l) => l.action === 'update');

  const ids: string[] = [];
  if (creates.length > 0) {
    const { submitTimesheet } = await import('./submit-timesheet.js');
    const result = await submitTimesheet({
      entries: creates.map((l) => ({
        date: l.date,
        employeeId: l.employeeId,
        name: l.name,
        dayType: l.row!.dayType,
        timeIn: l.row!.timeIn,
        timeOut: l.row!.timeOut,
        ninePmReturnsCount: l.row!.ninePmReturnsCount,
        dailyNotes: l.row!.dailyNotes,
        silInflation: 0,
        storeId,
      })),
    }, deps);
    ids.push(...result.timesheetIds);
  }
  if (updates.length > 0) {
    const { editTimesheet } = await import('./edit-timesheet.js');
    for (const l of updates) {
      const row = l.row!;
      const hours = row.timeIn && row.timeOut ? Timesheet.calculateHours(row.timeIn, row.timeOut) : { regularHours: 0, overtimeHours: 0 };
      await editTimesheet(l.existingId!, {
        dayType: row.dayType,
        timeIn: row.timeIn,
        timeOut: row.timeOut,
        regularHours: hours.regularHours,
        overtimeHours: hours.overtimeHours,
        ninePmReturnsCount: row.ninePmReturnsCount,
        dailyNotes: row.dailyNotes,
        storeId: fresh.get(`${l.employeeId}|${l.date}`)?.storeId ?? storeId,
      }, userId, { onlyPending: true });
      ids.push(l.existingId!);
    }
  }

  if (ids.length > 0) {
    const { syncNinePmPayouts } = await import('../payroll/nine-pm-payout.js');
    await syncNinePmPayouts(ids, viewer.employeeId);
    const { recalculateLeaveUsed } = await import('./leave-usage.js');
    await recalculateLeaveUsed(writable.map((l) => l.employeeId));
    await audit(storeId, state.weekStart, viewer.employeeId, 'sent_to_timesheets', {
      detail: { after: `${creates.length} new, ${updates.length} updated`, dates },
    });
  }

  return {
    created: creates.length,
    updated: updates.length,
    skipped: plan.length - writable.length,
    week: await getRotaWeek(storeId, state.weekStart, viewer, 'manager'),
  };
}
