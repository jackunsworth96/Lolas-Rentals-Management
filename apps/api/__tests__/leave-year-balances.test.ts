import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock('../src/adapters/supabase/client.js', () => {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let inserted: Row | null = null;
    const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      gt: (c: string, v: string) => { filters.push((r) => String(r[c]) > v); return q; },
      lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return q; },
      lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return q; },
      insert: (row: Row) => {
        inserted = { id: `new-${Math.random()}`, status: 'pending', created_at: '2026-11-20T00:00:00Z', ...row };
        (db.tables[table] ??= []).push(inserted);
        return q;
      },
      single: async () => ({ data: inserted ?? rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: inserted ?? rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: rows(), error: null })),
    };
    return q;
  };
  return { getSupabaseClient: () => ({ from }), supabase: { from } };
});
vi.mock('../src/adapters/supabase/config-repo.js', () => ({ resolvePayrollLedger: vi.fn() }));

const { leaveYearRange, daysWithinYear, leaveBalances } = await import('../src/use-cases/hr/leave-usage.js');
const { createLeaveRequest } = await import('../src/use-cases/hr/staff-requests.js');

const EMP = 'reland';

function holidayTimesheets(dates: string[]): Row[] {
  return dates.map((date, i) => ({ id: `ts-${i}`, employee_id: EMP, date, day_type: 'Holiday' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T02:00:00Z'));
  db.tables = {
    employees: [{
      id: EMP, store_id: 'store', full_name: 'Reland', status: 'Active',
      start_date: '2024-01-01', probation_end_date: null, holiday_allowance: 5, sick_allowance: 5,
    }],
    leave_config: [{ store_id: 'store', reset_month: 1, reset_day: 1 }],
    timesheets: holidayTimesheets(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']),
    leave_requests: [],
  };
});

afterEach(() => vi.useRealTimers());

describe('leaveYearRange', () => {
  it('uses the calendar year for a 1 January reset', () => {
    expect(leaveYearRange('2026-11-20')).toEqual({ start: '2026-01-01', end: '2027-01-01', label: '2026' });
  });

  it('handles a mid-year reset date on both sides of the reset', () => {
    expect(leaveYearRange('2026-03-31', 4, 1)).toEqual({ start: '2025-04-01', end: '2026-04-01', label: '2025/26' });
    expect(leaveYearRange('2026-04-01', 4, 1)).toEqual({ start: '2026-04-01', end: '2027-04-01', label: '2026/27' });
  });
});

describe('daysWithinYear', () => {
  it('counts only the part of a range inside the year', () => {
    const y2026 = leaveYearRange('2026-06-01');
    const y2027 = leaveYearRange('2027-06-01');
    expect(daysWithinYear('2026-12-29', '2027-01-03', y2026)).toBe(3);
    expect(daysWithinYear('2026-12-29', '2027-01-03', y2027)).toBe(3);
    expect(daysWithinYear('2025-12-01', '2025-12-05', y2026)).toBe(0);
  });
});

describe('leaveBalances', () => {
  it('gives a fresh allowance for next year when this year is used up', async () => {
    const now = await leaveBalances(EMP, '2026-11-20');
    expect(now.holiday).toMatchObject({ used: 5, remaining: 0 });
    const next = await leaveBalances(EMP, '2027-02-01');
    expect(next.year.label).toBe('2027');
    expect(next.holiday).toMatchObject({ used: 0, remaining: 5 });
  });

  it('does not count approved leave in January 2027 against 2026', async () => {
    db.tables.timesheets = holidayTimesheets(['2026-06-01', '2027-01-05', '2027-01-06']);
    expect((await leaveBalances(EMP, '2026-11-20')).holiday.used).toBe(1);
    expect((await leaveBalances(EMP, '2027-01-10')).holiday.used).toBe(2);
  });

  it('splits pending requests that cross the reset date', async () => {
    db.tables.leave_requests = [{
      id: 'r1', employee_id: EMP, leave_type: 'holiday', status: 'pending', start_date: '2026-12-30', end_date: '2027-01-02',
    }];
    expect((await leaveBalances(EMP, '2026-11-20')).holiday.pending).toBe(2);
    expect((await leaveBalances(EMP, '2027-03-01')).holiday.pending).toBe(2);
    expect((await leaveBalances(EMP, '2027-03-01', { ignoreRequestId: 'r1' })).holiday.pending).toBe(0);
  });
});

describe('createLeaveRequest', () => {
  it('allows a 2027 holiday when 2026 is used up', async () => {
    const rec = await createLeaveRequest(EMP, { leaveType: 'holiday', startDate: '2027-02-01', endDate: '2027-02-03' });
    expect(rec.days).toBe(3);
  });

  it('still blocks extra 2026 days when 2026 is used up', async () => {
    await expect(createLeaveRequest(EMP, { leaveType: 'holiday', startDate: '2026-12-10', endDate: '2026-12-10' }))
      .rejects.toThrow(/for 2026/);
  });

  it('checks each year of a cross-year request against its own balance', async () => {
    db.tables.timesheets = holidayTimesheets(['2026-03-01', '2026-04-01', '2026-05-01']);
    // 2 days left in 2026 and 5 in 2027: 29-31 Dec is 3 days, too many for 2026.
    await expect(createLeaveRequest(EMP, { leaveType: 'holiday', startDate: '2026-12-29', endDate: '2027-01-02' }))
      .rejects.toThrow(/for 2026: 3 days requested, 2 available/);
    const ok = await createLeaveRequest(EMP, { leaveType: 'holiday', startDate: '2026-12-30', endDate: '2027-01-04' });
    expect(ok.days).toBe(6);
  });

  it('rejects dates beyond the end of next leave year', async () => {
    await expect(createLeaveRequest(EMP, { leaveType: 'unpaid', startDate: '2028-01-02', endDate: '2028-01-03' }))
      .rejects.toThrow(/up to 2027-12-31/);
  });
});
