import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, recalculateLeaveUsed } = vi.hoisted(() => ({ rpc: vi.fn(), recalculateLeaveUsed: vi.fn() }));
const calls: Array<{ table: string; op: string }> = [];
let timesheetRow: Record<string, unknown> | null = null;
let payout: { id: string } | null = null;
let deletedRows: Array<{ id: string }> = [];

function result(table: string, op: string) {
  if (table === 'timesheets' && op === 'select') return { data: timesheetRow, error: null };
  if (table === 'timesheets' && op === 'delete') return { data: deletedRows, error: null };
  if (table === 'expenses') return { data: payout, error: null };
  if (table === 'timesheet_deletions' && op === 'insert') return { data: { id: 'log-1' }, error: null };
  return { data: null, error: null };
}

/** Chainable Supabase stub: the first verb (select/insert/delete/update) decides the result. */
function builder(table: string) {
  let op = '';
  const chain: Record<string, unknown> = {};
  for (const verb of ['select', 'insert', 'delete', 'update']) {
    chain[verb] = () => {
      if (!op) {
        op = verb;
        calls.push({ table, op });
      }
      return chain;
    };
  }
  for (const m of ['eq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit']) chain[m] = () => chain;
  chain.single = async () => result(table, op);
  chain.maybeSingle = async () => result(table, op);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result(table, op)).then(resolve);
  return chain;
}

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: () => ({ from: (t: string) => builder(t), rpc }),
}));
vi.mock('../src/use-cases/hr/leave-usage.js', () => ({ recalculateLeaveUsed }));
vi.mock('../src/lib/telegram.js', () => ({ sendTelegramMessage: vi.fn() }));
vi.mock('../src/services/email.js', () => ({ escapeHtml: (s: string) => s }));

import { deleteTimesheet } from '../src/use-cases/hr/delete-timesheet.js';
import { approveTimesheets } from '../src/use-cases/hr/approve-timesheets.js';
import { filterWritableLines, type TimesheetPreviewLine } from '../src/use-cases/hr/rota-timesheets.js';

const row = (payroll_status: string) => ({ id: 'ts-1', date: '2026-11-15', employee_id: 'emp-1', store_id: 'store-lolas', payroll_status, day_type: 'Regular' });

describe('deleteTimesheet', () => {
  beforeEach(() => {
    calls.length = 0;
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    recalculateLeaveUsed.mockReset();
    payout = null;
    deletedRows = [{ id: 'ts-1' }];
  });

  it('deletes a pending row, records why, and recalculates leave', async () => {
    timesheetRow = row('Pending');
    const result = await deleteTimesheet('ts-1', 'Entered for the wrong date', 'user-1');
    expect(result).toEqual({ id: 'ts-1', employeeId: 'emp-1' });
    expect(calls).toContainEqual({ table: 'timesheet_deletions', op: 'insert' });
    expect(calls).toContainEqual({ table: 'timesheets', op: 'delete' });
    expect(recalculateLeaveUsed).toHaveBeenCalledWith(['emp-1']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['Approved', 'Paid'])('refuses to delete a %s row', async (status) => {
    timesheetRow = row(status);
    await expect(deleteTimesheet('ts-1', 'Wrong date', 'user-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(calls).not.toContainEqual({ table: 'timesheets', op: 'delete' });
    expect(recalculateLeaveUsed).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing row', async () => {
    timesheetRow = null;
    await expect(deleteTimesheet('ts-x', 'Wrong date', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('removes an old 9pm till payout linked to the row', async () => {
    timesheetRow = row('Pending');
    payout = { id: 'exp-1' };
    await deleteTimesheet('ts-1', 'Duplicate', 'user-1');
    expect(rpc).toHaveBeenCalledWith('sync_nine_pm_payout', { p: expect.objectContaining({ timesheetId: 'ts-1', amount: 0 }) });
  });

  it('undoes the log when the row was approved in the meantime', async () => {
    timesheetRow = row('Pending');
    deletedRows = [];
    await expect(deleteTimesheet('ts-1', 'Wrong date', 'user-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(calls).toContainEqual({ table: 'timesheet_deletions', op: 'delete' });
    expect(recalculateLeaveUsed).not.toHaveBeenCalled();
  });
});

describe('approveTimesheets rota check', () => {
  const repo = () => ({
    findByPeriod: vi.fn(), findByEmployee: vi.fn(), save: vi.fn(), saveMany: vi.fn(), bulkUpdateStatus: vi.fn(),
  });

  it('rejects flagged rows that weren’t acknowledged', async () => {
    const timesheets = repo();
    await expect(approveTimesheets(
      { timesheetIds: ['a', 'b'] },
      { timesheets, unacknowledgedFlagged: async () => ['b'], acknowledge: vi.fn() },
    )).rejects.toMatchObject({ statusCode: 409, code: 'ROTA_CHECK_REQUIRED', timesheetIds: ['b'] });
    expect(timesheets.bulkUpdateStatus).not.toHaveBeenCalled();
  });

  it('records the acknowledgement and approves', async () => {
    const timesheets = repo();
    const acknowledge = vi.fn();
    const result = await approveTimesheets(
      { timesheetIds: ['a', 'b'], acknowledgedIds: ['b'] },
      { timesheets, unacknowledgedFlagged: async () => ['b'], acknowledge },
    );
    expect(acknowledge).toHaveBeenCalledWith(['b']);
    expect(timesheets.bulkUpdateStatus).toHaveBeenCalledWith(['a', 'b'], 'Approved');
    expect(result).toEqual({ approved: 2, acknowledged: 1 });
  });

  it('approves unflagged rows without asking', async () => {
    const timesheets = repo();
    await approveTimesheets({ timesheetIds: ['a'] }, { timesheets, unacknowledgedFlagged: async () => [] });
    expect(timesheets.bulkUpdateStatus).toHaveBeenCalledWith(['a'], 'Approved');
  });
});

describe('sending the rota to timesheets', () => {
  const line = (employeeId: string, action: TimesheetPreviewLine['action'], existingId: string | null = null): TimesheetPreviewLine => ({
    employeeId, name: employeeId, date: '2026-11-15', action, reason: null, existingId, existingStatus: existingId ? 'Pending' : null,
    row: { dayType: 'Regular', timeIn: '09:00', timeOut: '17:00', ninePmReturnsCount: 0, dailyNotes: null },
  });

  it('never overwrites a row that was approved after the preview', () => {
    const fresh = new Map([
      ['ronnie|2026-11-15', { id: 'ts-r', payrollStatus: 'Approved' }],
      ['maria|2026-11-15', { id: 'ts-m', payrollStatus: 'Pending' }],
    ]);
    const kept = filterWritableLines([line('ronnie', 'update', 'ts-r'), line('maria', 'update', 'ts-m')], fresh);
    expect(kept.map((l) => l.employeeId)).toEqual(['maria']);
  });

  it('drops a create when a row appeared in the meantime', () => {
    const fresh = new Map([['ronnie|2026-11-15', { id: 'ts-new', payrollStatus: 'Approved' }]]);
    expect(filterWritableLines([line('ronnie', 'create'), line('geo', 'create')], fresh).map((l) => l.employeeId)).toEqual(['geo']);
  });
});
