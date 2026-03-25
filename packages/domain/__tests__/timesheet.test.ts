import { describe, it, expect } from 'vitest';
import { Timesheet, type TimesheetProps } from '../src/entities/timesheet.js';

function makeTimesheetProps(
  overrides: Partial<TimesheetProps> = {},
): TimesheetProps {
  return {
    id: 'ts-1',
    date: '2025-03-10',
    employeeId: 'emp-1',
    name: 'Juan Dela Cruz',
    dayType: 'Regular',
    timeIn: '08:00',
    timeOut: '17:00',
    regularHours: 8,
    overtimeHours: 1,
    ninePmReturnsCount: 0,
    dailyNotes: null,
    payrollStatus: 'Pending',
    silInflation: 0,
    storeId: 'store-1',
    createdAt: new Date('2025-03-10'),
    ...overrides,
  };
}

describe('Timesheet', () => {
  describe('create', () => {
    it('creates a regular day with hours preserved', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({
          dayType: 'Regular',
          timeIn: '08:00',
          timeOut: '17:00',
          regularHours: 8,
          overtimeHours: 1,
        }),
      );
      expect(ts.timeIn).toBe('08:00');
      expect(ts.timeOut).toBe('17:00');
      expect(ts.regularHours).toBe(8);
      expect(ts.overtimeHours).toBe(1);
    });

    it('sets no time required for Holiday day type', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({
          dayType: 'Holiday',
          timeIn: '09:00',
          timeOut: '18:00',
          regularHours: 4,
          overtimeHours: 2,
        }),
      );
      expect(ts.timeIn).toBeNull();
      expect(ts.timeOut).toBeNull();
      expect(ts.regularHours).toBe(8);
      expect(ts.overtimeHours).toBe(0);
    });

    it('sets no time required for Sick day type', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({
          dayType: 'Sick',
          timeIn: '10:00',
          timeOut: '14:00',
          regularHours: 2,
          overtimeHours: 0,
        }),
      );
      expect(ts.timeIn).toBeNull();
      expect(ts.timeOut).toBeNull();
      expect(ts.regularHours).toBe(8);
      expect(ts.overtimeHours).toBe(0);
    });

    it('isLeaveDay returns true for Holiday', () => {
      const ts = Timesheet.create(makeTimesheetProps({ dayType: 'Holiday' }));
      expect(ts.isLeaveDay()).toBe(true);
    });

    it('isLeaveDay returns false for Regular', () => {
      const ts = Timesheet.create(makeTimesheetProps({ dayType: 'Regular' }));
      expect(ts.isLeaveDay()).toBe(false);
    });
  });

  describe('calculateHours', () => {
    it('caps regular hours at 8', () => {
      const { regularHours, overtimeHours } = Timesheet.calculateHours(
        '08:00',
        '18:00',
      );
      expect(regularHours).toBe(8);
      expect(overtimeHours).toBe(2);
    });

    it('returns all as regular when under 8 hours', () => {
      const { regularHours, overtimeHours } = Timesheet.calculateHours(
        '09:00',
        '14:00',
      );
      expect(regularHours).toBeCloseTo(5, 1);
      expect(overtimeHours).toBe(0);
    });

    it('handles exactly 8 hours with no overtime', () => {
      const { regularHours, overtimeHours } = Timesheet.calculateHours(
        '08:00',
        '16:00',
      );
      expect(regularHours).toBe(8);
      expect(overtimeHours).toBe(0);
    });

    it('handles overnight shifts (wrap-around)', () => {
      const { regularHours, overtimeHours } = Timesheet.calculateHours(
        '22:00',
        '06:00',
      );
      expect(regularHours).toBe(8);
      expect(overtimeHours).toBe(0);
    });
  });

  describe('status transitions', () => {
    it('transitions Pending → Approved', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Pending' }),
      );
      ts.approve();
      expect(ts.payrollStatus).toBe('Approved');
    });

    it('transitions Approved → Paid', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Approved' }),
      );
      ts.markPaid();
      expect(ts.payrollStatus).toBe('Paid');
    });

    it('rejects Pending → Paid (skipping Approved)', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Pending' }),
      );
      expect(() => ts.markPaid()).toThrow();
    });

    it('rejects Approved → Approved (same state)', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Approved' }),
      );
      expect(() => ts.approve()).toThrow();
    });

    it('rejects Paid → Approved (backward)', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Paid' }),
      );
      expect(() => ts.approve()).toThrow();
    });

    it('rejects Paid → Paid (already terminal)', () => {
      const ts = Timesheet.create(
        makeTimesheetProps({ payrollStatus: 'Paid' }),
      );
      expect(() => ts.markPaid()).toThrow();
    });
  });
});
