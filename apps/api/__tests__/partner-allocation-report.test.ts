import { describe, expect, it } from 'vitest';
import { allocationReport, type AllocationReportInput } from '../src/lib/partner-allocation-report.js';
const base: AllocationReportInput = {
  from: '2026-10-01', to: '2026-11-01', now: Date.parse('2026-11-01T00:00:00+08:00'),
  baselines: [{ effective_month: '2026-10-01', scheduled_qty: 2 }], overrides: [], reservations: [], segments: [],
};
describe('partner allocation utilization', () => {
  it('weights partial-day guaranteed usage and reports overflow separately', () => {
    const report = allocationReport({ ...base, from: '2026-10-01', to: '2026-10-02',
      reservations: [{ id: 'r', actual_start: '2026-10-01T12:00:00+08:00', actual_end: '2026-10-02T00:00:00+08:00', ends_at: '2026-10-02T00:30:00+08:00' }],
      segments: [{ reservation_id: 'r', starts_at: '2026-10-01T12:00:00+08:00', ends_at: '2026-10-01T18:00:00+08:00', pool: 'guaranteed' }, { reservation_id: 'r', starts_at: '2026-10-01T18:00:00+08:00', ends_at: '2026-10-02T00:30:00+08:00', pool: 'shared' }],
    });
    expect(report.days[0]).toMatchObject({ allocatedHours: 48, guaranteedHours: 6, overflowHours: 6, utilization: 0.125 });
  });
  it('uses effective quantities and ignores holds and future reservations', () => {
    const result = allocationReport({ ...base, overrides: [{ starts_on: '2026-10-02', ends_before: '2026-10-03', qty: 1 }], reservations: [{ id: 'hold', actual_start: null, actual_end: null, ends_at: '2026-10-04T00:00:00+08:00' }], segments: [{ reservation_id: 'hold', starts_at: '2026-10-01T00:00:00+08:00', ends_at: '2026-10-04T00:00:00+08:00', pool: 'guaranteed' }] });
    expect(result.months[0].allocatedHours).toBe(31 * 48 - 24);
    expect(result.months[0].guaranteedHours).toBe(0);
  });
  it('requires three completed weeks with positive allocations', () => {
    expect(allocationReport(base).underutilized).toBe(true);
    expect(allocationReport({ ...base, from: '2026-10-12' }).underutilized).toBe(false);
    expect(allocationReport({ ...base, overrides: [{ starts_on: '2026-10-20', ends_before: '2026-10-21', qty: 0 }] }).underutilized).toBe(false);
    const busyWeek = allocationReport({ ...base,
      reservations: [{ id: 'busy', actual_start: '2026-10-18T00:00:00+08:00', actual_end: '2026-10-25T00:00:00+08:00', ends_at: '2026-10-25T00:30:00+08:00' }],
      segments: [{ reservation_id: 'busy', starts_at: '2026-10-18T00:00:00+08:00', ends_at: '2026-10-25T00:30:00+08:00', pool: 'guaranteed' }],
    });
    expect(busyWeek.underutilized).toBe(false);
  });
});
