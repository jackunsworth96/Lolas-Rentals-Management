import type { RotaKind } from './rota-rules.js';

/** Day types recorded through leave requests; the rota never writes these. */
export const ROTA_LEAVE_DAY_TYPES: readonly string[] = ['Holiday', 'Sick', 'Unpaid Leave'];

export interface RotaActualHours {
  startTime: string | null;
  endTime: string | null;
  ninePmReturns: number;
  note: string | null;
}

export interface ExistingTimesheet {
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  payrollStatus: 'Pending' | 'Approved' | 'Paid';
}

export interface PlanTimesheetInput {
  kind: RotaKind | 'leave' | 'not_started' | null;
  startTime: string | null;
  endTime: string | null;
  actual: RotaActualHours | null;
  /** This person is the day's 9pm returns assignee. */
  ninePmAssignee: boolean;
  /** 9pm returns booked that day. */
  ninePmCount: number;
  existing: ExistingTimesheet | null;
}

export interface PlannedTimesheetRow {
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
}

export type PlanTimesheetResult =
  | { action: 'create' | 'update'; row: PlannedTimesheetRow }
  | { action: 'skip'; reason: string; row: PlannedTimesheetRow | null };

const hm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

function minutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Hours from start to end; an end before the start runs past midnight. */
export function shiftHours(start: string, end: string): number {
  const a = minutes(start);
  const b = minutes(end);
  return ((b > a ? b - a : b + 1440 - a) / 60);
}

function sameRow(a: PlannedTimesheetRow, b: ExistingTimesheet): boolean {
  return a.dayType === b.dayType
    && hm(a.timeIn) === hm(b.timeIn)
    && hm(a.timeOut) === hm(b.timeOut)
    && a.ninePmReturnsCount === b.ninePmReturnsCount
    && (a.dailyNotes ?? null) === (b.dailyNotes ?? null);
}

/** What sending one rota cell to timesheets would do. */
export function planTimesheetRow(input: PlanTimesheetInput): PlanTimesheetResult {
  const { kind, actual, existing } = input;
  if (existing && existing.payrollStatus !== 'Pending') {
    return { action: 'skip', reason: `Timesheet already ${existing.payrollStatus.toLowerCase()}`, row: null };
  }
  if (kind == null || kind === 'not_started') return { action: 'skip', reason: 'Not on the rota', row: null };
  if (kind === 'holiday' || kind === 'sick' || kind === 'unpaid_leave' || kind === 'leave') {
    return { action: 'skip', reason: 'Leave is recorded through leave requests', row: null };
  }

  // Without hours entered on the rota, the existing row is a better record than the plan.
  if (existing && !actual) return { action: 'skip', reason: 'Already on timesheets', row: null };

  const workedTimes = !!actual?.startTime && !!actual?.endTime;
  if (kind === 'day_off' && !workedTimes) return { action: 'skip', reason: 'Day off', row: null };
  if (kind === 'out_of_office' && !workedTimes) return { action: 'skip', reason: 'Out of office (self-managed)', row: null };

  const keepDayType = existing && !ROTA_LEAVE_DAY_TYPES.includes(existing.dayType) ? existing.dayType : null;
  const row: PlannedTimesheetRow = {
    dayType: kind === 'day_off' ? 'Rest Day' : keepDayType ?? 'Regular',
    timeIn: workedTimes ? hm(actual!.startTime) : hm(input.startTime),
    timeOut: workedTimes ? hm(actual!.endTime) : hm(input.endTime),
    ninePmReturnsCount: actual ? actual.ninePmReturns : input.ninePmAssignee ? input.ninePmCount : 0,
    dailyNotes: actual?.note?.trim() || existing?.dailyNotes || null,
  };
  if (!existing) return { action: 'create', row };
  if (sameRow(row, existing)) return { action: 'skip', reason: 'Already up to date', row };
  return { action: 'update', row };
}

// ── Checking timesheets against the rota ────────────────────────────────────

export type RotaFlagCode = 'not_on_rota' | 'rostered_off' | 'hours_differ' | 'nine_pm_mismatch' | 'rota_not_published';

export interface RotaFlag {
  code: RotaFlagCode;
  /** Warnings must be acknowledged before approval; info is shown only. */
  level: 'warning' | 'info';
  message: string;
}

export interface RotaPlanCell {
  kind: RotaKind | 'not_started';
  startTime: string | null;
  endTime: string | null;
  ninePmAssignee: boolean;
  /** 9pm returns recorded on the rota for this person, when entered. */
  actualNinePm: number | null;
  weekPublished: boolean;
}

export interface TimesheetForCheck {
  date: string;
  name: string;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
}

/** Differences this big between planned and worked hours need a second look. */
export const HOURS_DIFF_THRESHOLD = 2;

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** `cell` is null when the person has no place on that day's rota. */
export function checkTimesheetAgainstRota(row: TimesheetForCheck, cell: RotaPlanCell | null): RotaFlag[] {
  const who = row.name.split(' ')[0] || 'This person';
  const day = dayLabel(row.date);
  const flags: RotaFlag[] = [];

  if (!cell) return [{ code: 'not_on_rota', level: 'warning', message: `${who} isn’t on the rota on ${day}` }];
  if (cell.kind === 'not_started') return [{ code: 'not_on_rota', level: 'warning', message: `${who} hadn’t started yet on ${day}` }];

  const leaveRow = ROTA_LEAVE_DAY_TYPES.includes(row.dayType);
  if (!leaveRow) {
    if (cell.kind === 'day_off' && row.dayType !== 'Rest Day') {
      flags.push({ code: 'rostered_off', level: 'warning', message: `${who} has a day off on the rota on ${day}. If they worked, use Rest Day.` });
    } else if (cell.kind === 'holiday' || cell.kind === 'sick' || cell.kind === 'unpaid_leave') {
      const label = { holiday: 'on holiday', sick: 'off sick', unpaid_leave: 'on unpaid leave' }[cell.kind];
      flags.push({ code: 'rostered_off', level: 'warning', message: `${who} is ${label} on the rota on ${day}` });
    } else if (cell.kind === 'working' && cell.startTime && cell.endTime && row.timeIn && row.timeOut) {
      const planned = shiftHours(cell.startTime, cell.endTime);
      const worked = shiftHours(row.timeIn, row.timeOut);
      const diff = worked - planned;
      const lateForNinePm = diff > 0 && (row.ninePmReturnsCount > 0 || cell.ninePmAssignee);
      if (Math.abs(diff) >= HOURS_DIFF_THRESHOLD && !lateForNinePm) {
        flags.push({ code: 'hours_differ', level: 'warning', message: `${who} worked ${round1(worked)}h on ${day}; the rota planned ${round1(planned)}h` });
      }
    }
  }

  if (row.ninePmReturnsCount > 0 && !cell.ninePmAssignee && cell.actualNinePm == null) {
    flags.push({ code: 'nine_pm_mismatch', level: 'warning', message: `${who} has ${row.ninePmReturnsCount} × 9pm on ${day} but wasn’t on 9pm returns on the rota` });
  } else if (cell.actualNinePm != null && cell.actualNinePm !== row.ninePmReturnsCount) {
    flags.push({ code: 'nine_pm_mismatch', level: 'warning', message: `The rota records ${cell.actualNinePm} × 9pm for ${who} on ${day}; the timesheet has ${row.ninePmReturnsCount}` });
  }

  if (!cell.weekPublished) {
    flags.push({ code: 'rota_not_published', level: 'info', message: `The rota for ${day} wasn’t published` });
  }
  return flags;
}

export function hasBlockingFlags(flags: readonly RotaFlag[]): boolean {
  return flags.some((f) => f.level === 'warning');
}
