export type RotaKind = 'working' | 'day_off' | 'holiday' | 'sick' | 'unpaid_leave' | 'out_of_office';
export type RotaMode = 'rostered' | 'self_managed' | 'excluded';

export interface RotaPerson {
  employeeId: string;
  name: string;
  mode: RotaMode;
  countsTowardCover: boolean;
  targetDaysPerWeek: number;
}

export interface RotaRulesInput {
  /** The 7 dates of the week, Monday first. */
  dates: string[];
  people: RotaPerson[];
  /** Resolved kind for every cell; null when nothing is planned (self-managed staff). */
  cellKind: (employeeId: string, date: string) => RotaKind | null;
  minStaff: number;
  emergencyMinStaff: number;
  maxOffPerDay: number;
  emergencyDates: ReadonlySet<string>;
}

export type RotaCoverStatus = 'ok' | 'emergency' | 'short';

export interface RotaDayCover {
  date: string;
  working: number;
  required: number;
  off: number;
  status: RotaCoverStatus;
}

export type RotaIssueCode = 'pending_picks' | 'nine_pm_unassigned' | 'nine_pm_not_working' | 'no_cover' | 'short_cover' | 'emergency_cover' | 'too_many_off' | 'no_day_off' | 'over_target' | 'under_target';

export interface RotaIssue {
  /** Blockers stop the week being published. */
  level: 'blocker' | 'warning';
  code: RotaIssueCode;
  message: string;
  date?: string;
  employeeId?: string;
}

const LEAVE_KINDS: ReadonlySet<RotaKind> = new Set(['holiday', 'sick', 'unpaid_leave']);

/** Monday of the ISO week containing a YYYY-MM-DD date. */
export function rotaWeekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export function rotaWeekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function evaluateRotaWeek(input: RotaRulesInput): { cover: RotaDayCover[]; issues: RotaIssue[] } {
  const rostered = input.people.filter((p) => p.mode === 'rostered');
  const coverPeople = rostered.filter((p) => p.countsTowardCover);
  const issues: RotaIssue[] = [];

  const cover = input.dates.map((date): RotaDayCover => {
    const working = coverPeople.filter((p) => input.cellKind(p.employeeId, date) === 'working').length;
    const off = rostered.filter((p) => {
      const k = input.cellKind(p.employeeId, date);
      return k != null && k !== 'working';
    }).length;
    const label = dayLabel(date);

    let status: RotaCoverStatus = 'ok';
    if (working < input.minStaff) {
      const emergencyOk = input.emergencyDates.has(date) && working >= input.emergencyMinStaff && working > 0;
      status = emergencyOk ? 'emergency' : 'short';
      if (emergencyOk) {
        issues.push({ level: 'warning', code: 'emergency_cover', date, message: `${label}: running on ${working} (emergency cover approved)` });
      } else if (working === 0) {
        issues.push({ level: 'blocker', code: 'no_cover', date, message: `${label}: nobody is working` });
      } else {
        issues.push({ level: 'blocker', code: 'short_cover', date, message: `${label}: only ${working} working, need ${input.minStaff}` });
      }
    }
    if (off > input.maxOffPerDay) {
      issues.push({ level: 'warning', code: 'too_many_off', date, message: `${label}: ${off} people off (limit ${input.maxOffPerDay})` });
    }
    return { date, working, required: input.minStaff, off, status };
  });

  for (const p of rostered) {
    const kinds = input.dates.map((d) => input.cellKind(p.employeeId, d));
    const workingDays = kinds.filter((k) => k === 'working').length;
    const leaveDays = kinds.filter((k) => k != null && LEAVE_KINDS.has(k)).length;
    const expected = Math.max(0, p.targetDaysPerWeek - leaveDays);

    if (workingDays === input.dates.length) {
      issues.push({ level: 'warning', code: 'no_day_off', employeeId: p.employeeId, message: `${p.name} has no day off this week (a worked rest day is paid at the Rest Day rate)` });
    } else if (workingDays > p.targetDaysPerWeek) {
      issues.push({ level: 'warning', code: 'over_target', employeeId: p.employeeId, message: `${p.name} is working ${workingDays} days (normally ${p.targetDaysPerWeek})` });
    }
    if (workingDays < expected) {
      issues.push({ level: 'warning', code: 'under_target', employeeId: p.employeeId, message: `${p.name} is working ${workingDays} days (normally ${p.targetDaysPerWeek})` });
    }
  }

  return { cover, issues };
}
