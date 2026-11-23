import { describe, it, expect } from 'vitest';
import {
  checkTimesheetAgainstRota,
  hasBlockingFlags,
  planTimesheetRow,
  shiftHours,
  type ExistingTimesheet,
  type PlanTimesheetInput,
  type RotaPlanCell,
  type TimesheetForCheck,
} from '../src/services/rota-timesheets.js';

const working: PlanTimesheetInput = {
  kind: 'working', startTime: '09:00', endTime: '17:00', actual: null, ninePmAssignee: false, ninePmCount: 0, existing: null,
};
const pending = (extra: Partial<ExistingTimesheet> = {}): ExistingTimesheet => ({
  dayType: 'Regular', timeIn: '09:00:00', timeOut: '17:00:00', ninePmReturnsCount: 0, dailyNotes: null, payrollStatus: 'Pending', ...extra,
});

describe('planTimesheetRow', () => {
  it('creates a Regular row from the planned hours', () => {
    expect(planTimesheetRow(working)).toEqual({
      action: 'create',
      row: { dayType: 'Regular', timeIn: '09:00', timeOut: '17:00', ninePmReturnsCount: 0, dailyNotes: null },
    });
  });

  it('uses hours entered on the rota over the plan', () => {
    const r = planTimesheetRow({ ...working, actual: { startTime: '09:00', endTime: '21:30', ninePmReturns: 2, note: 'Late returns' } });
    expect(r.action).toBe('create');
    expect(r.row).toMatchObject({ timeOut: '21:30', ninePmReturnsCount: 2, dailyNotes: 'Late returns' });
  });

  it('gives the 9pm assignee the day’s booked returns', () => {
    expect(planTimesheetRow({ ...working, ninePmAssignee: true, ninePmCount: 3 }).row?.ninePmReturnsCount).toBe(3);
    expect(planTimesheetRow({ ...working, ninePmAssignee: false, ninePmCount: 3 }).row?.ninePmReturnsCount).toBe(0);
  });

  it('never touches approved or paid rows', () => {
    for (const payrollStatus of ['Approved', 'Paid'] as const) {
      const r = planTimesheetRow({ ...working, actual: { startTime: '10:00', endTime: '18:00', ninePmReturns: 0, note: null }, existing: pending({ payrollStatus }) });
      expect(r.action).toBe('skip');
    }
  });

  it('skips leave, days off and self-managed days with no hours', () => {
    expect(planTimesheetRow({ ...working, kind: 'sick' }).action).toBe('skip');
    expect(planTimesheetRow({ ...working, kind: 'leave' }).action).toBe('skip');
    expect(planTimesheetRow({ ...working, kind: 'day_off', startTime: null, endTime: null }).action).toBe('skip');
    expect(planTimesheetRow({ ...working, kind: 'out_of_office', startTime: null, endTime: null }).action).toBe('skip');
    expect(planTimesheetRow({ ...working, kind: 'not_started' }).action).toBe('skip');
  });

  it('pays a worked day off as Rest Day', () => {
    const r = planTimesheetRow({ ...working, kind: 'day_off', startTime: null, endTime: null, actual: { startTime: '09:00', endTime: '17:00', ninePmReturns: 0, note: null } });
    expect(r).toMatchObject({ action: 'create', row: { dayType: 'Rest Day' } });
  });

  it('leaves an existing pending row alone when no hours were entered', () => {
    expect(planTimesheetRow({ ...working, existing: pending({ timeOut: '19:00:00' }) })).toMatchObject({ action: 'skip', reason: 'Already on timesheets' });
  });

  it('updates a pending row with new hours and skips it when nothing changed', () => {
    const actual = { startTime: '09:00', endTime: '19:00', ninePmReturns: 0, note: null };
    expect(planTimesheetRow({ ...working, actual, existing: pending() }).action).toBe('update');
    expect(planTimesheetRow({ ...working, actual, existing: pending({ timeOut: '19:00:00' }) }).action).toBe('skip');
  });

  it('keeps a holiday day type already on the pending row', () => {
    const r = planTimesheetRow({ ...working, actual: { startTime: '09:00', endTime: '18:00', ninePmReturns: 0, note: null }, existing: pending({ dayType: 'Regular Holiday' }) });
    expect(r.row?.dayType).toBe('Regular Holiday');
  });
});

describe('shiftHours', () => {
  it('handles shifts past midnight', () => {
    expect(shiftHours('09:00', '17:00')).toBe(8);
    expect(shiftHours('20:00', '02:00')).toBe(6);
  });
});

describe('checkTimesheetAgainstRota', () => {
  const row = (extra: Partial<TimesheetForCheck> = {}): TimesheetForCheck => ({
    date: '2026-11-15', name: 'Ronnie Cruz', dayType: 'Regular', timeIn: '09:00', timeOut: '17:00', ninePmReturnsCount: 0, ...extra,
  });
  const cell = (extra: Partial<RotaPlanCell> = {}): RotaPlanCell => ({
    kind: 'working', startTime: '09:00', endTime: '17:00', ninePmAssignee: false, actualNinePm: null, weekPublished: true, ...extra,
  });
  const codes = (r: TimesheetForCheck, c: RotaPlanCell | null) => checkTimesheetAgainstRota(r, c).map((f) => f.code);

  it('is clean when the timesheet matches the rota', () => {
    expect(checkTimesheetAgainstRota(row(), cell())).toEqual([]);
  });

  it('flags someone who isn’t on the rota that day', () => {
    const flags = checkTimesheetAgainstRota(row(), null);
    expect(flags).toEqual([{ code: 'not_on_rota', level: 'warning', message: 'Ronnie isn’t on the rota on Sun 15 Nov' }]);
    expect(codes(row(), cell({ kind: 'not_started' }))).toEqual(['not_on_rota']);
  });

  it('flags a Regular row on a rostered day off, but not a Rest Day row', () => {
    expect(codes(row(), cell({ kind: 'day_off', startTime: null, endTime: null }))).toEqual(['rostered_off']);
    expect(codes(row({ dayType: 'Rest Day' }), cell({ kind: 'day_off', startTime: null, endTime: null }))).toEqual([]);
    expect(codes(row(), cell({ kind: 'holiday' }))).toEqual(['rostered_off']);
  });

  it('flags hours 2h or more away from the plan', () => {
    expect(codes(row({ timeOut: '18:30' }), cell())).toEqual([]);
    expect(codes(row({ timeOut: '19:00' }), cell())).toEqual(['hours_differ']);
    expect(codes(row({ timeOut: '14:00' }), cell())).toEqual(['hours_differ']);
  });

  it('doesn’t flag a late finish for 9pm returns', () => {
    expect(codes(row({ timeOut: '21:30', ninePmReturnsCount: 1 }), cell({ ninePmAssignee: true }))).toEqual([]);
  });

  it('flags 9pm returns that don’t match the rota', () => {
    expect(codes(row({ ninePmReturnsCount: 1 }), cell())).toEqual(['nine_pm_mismatch']);
    expect(codes(row({ ninePmReturnsCount: 1 }), cell({ ninePmAssignee: true, actualNinePm: 2 }))).toEqual(['nine_pm_mismatch']);
    expect(codes(row({ ninePmReturnsCount: 2 }), cell({ ninePmAssignee: true, actualNinePm: 2 }))).toEqual([]);
  });

  it('notes an unpublished week without blocking approval', () => {
    const flags = checkTimesheetAgainstRota(row(), cell({ weekPublished: false }));
    expect(flags.map((f) => f.code)).toEqual(['rota_not_published']);
    expect(hasBlockingFlags(flags)).toBe(false);
  });

  it('doesn’t check hours on leave rows', () => {
    expect(codes(row({ dayType: 'Sick', timeIn: null, timeOut: null }), cell({ kind: 'day_off' }))).toEqual([]);
  });
});
