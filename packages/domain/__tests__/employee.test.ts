import { describe, it, expect } from 'vitest';
import { InsufficientLeaveBalanceError } from '../src/errors/domain-error.js';
import { Employee, type EmployeeProps } from '../src/entities/employee.js';

function makeEmployeeProps(
  overrides: Partial<EmployeeProps> = {},
): EmployeeProps {
  return {
    id: 'emp-1',
    storeId: 'store-1',
    fullName: 'Juan Dela Cruz',
    role: 'Mechanic',
    status: 'Active',
    basicRate: 500,
    overtimeRate: 100,
    ninePmBonusRate: 50,
    commissionRate: 0.05,
    paidAs: null,
    monthlyBikeAllowance: 1000,
    bikeAllowanceUsed: 0,
    bikeAllowanceAccrued: 0,
    availableBalance: 1000,
    thirteenthMonthAccrued: 0,
    currentCashAdvance: 0,
    holidayAllowance: 10,
    holidayUsed: 0,
    sickAllowance: 5,
    sickUsed: 0,
    sssDeductionAmt: 0,
    philhealthDeductionAmt: 0,
    pagibigDeductionAmt: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('Employee', () => {
  describe('canTakeLeave', () => {
    it('returns true when holiday balance remaining', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 3 }),
      );
      expect(emp.canTakeLeave('holiday')).toBe(true);
    });

    it('returns true when sick balance remaining', () => {
      const emp = Employee.create(
        makeEmployeeProps({ sickAllowance: 5, sickUsed: 2 }),
      );
      expect(emp.canTakeLeave('sick')).toBe(true);
    });

    it('returns false when holiday leave exhausted', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 10 }),
      );
      expect(emp.canTakeLeave('holiday')).toBe(false);
    });

    it('returns false when sick leave exhausted', () => {
      const emp = Employee.create(
        makeEmployeeProps({ sickAllowance: 5, sickUsed: 5 }),
      );
      expect(emp.canTakeLeave('sick')).toBe(false);
    });
  });

  describe('deductLeave', () => {
    it('decrements holiday used', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 2 }),
      );
      emp.deductLeave('holiday', 3);
      expect(emp.holidayUsed).toBe(5);
    });

    it('decrements sick used', () => {
      const emp = Employee.create(
        makeEmployeeProps({ sickAllowance: 5, sickUsed: 1 }),
      );
      emp.deductLeave('sick', 2);
      expect(emp.sickUsed).toBe(3);
    });

    it('throws when exceeding holiday allowance', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 8 }),
      );
      expect(() => emp.deductLeave('holiday', 5)).toThrow(
        InsufficientLeaveBalanceError,
      );
    });

    it('throws when exceeding sick allowance', () => {
      const emp = Employee.create(
        makeEmployeeProps({ sickAllowance: 5, sickUsed: 4 }),
      );
      expect(() => emp.deductLeave('sick', 3)).toThrow(
        InsufficientLeaveBalanceError,
      );
    });

    it('allows deducting exactly the remaining balance', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 7 }),
      );
      emp.deductLeave('holiday', 3);
      expect(emp.holidayUsed).toBe(10);
      expect(emp.canTakeLeave('holiday')).toBe(false);
    });
  });

  describe('getRemainingLeave', () => {
    it('calculates remaining holiday leave', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 4 }),
      );
      expect(emp.getRemainingLeave('holiday')).toBe(6);
    });

    it('calculates remaining sick leave', () => {
      const emp = Employee.create(
        makeEmployeeProps({ sickAllowance: 5, sickUsed: 3 }),
      );
      expect(emp.getRemainingLeave('sick')).toBe(2);
    });

    it('returns 0 when fully used', () => {
      const emp = Employee.create(
        makeEmployeeProps({ holidayAllowance: 10, holidayUsed: 10 }),
      );
      expect(emp.getRemainingLeave('holiday')).toBe(0);
    });
  });
});
