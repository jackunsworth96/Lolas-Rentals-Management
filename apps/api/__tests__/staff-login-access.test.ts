import { describe, expect, it } from 'vitest';
import { isInactiveEmployeeStatus, staffLoginDecision } from '../src/auth/staff-login-access.js';

describe('staff login access', () => {
  it('treats only an inactive employee status as blocked', () => {
    expect(isInactiveEmployeeStatus('Inactive')).toBe(true);
    expect(isInactiveEmployeeStatus(' inactive ')).toBe(true);
    expect(isInactiveEmployeeStatus('Active')).toBe(false);
    expect(isInactiveEmployeeStatus(null)).toBe(false);
  });

  it('denies login when the user account or the employee is inactive', () => {
    expect(staffLoginDecision({ userFound: true, userActive: true, employeeStatus: 'Active' })).toBe('ok');
    expect(staffLoginDecision({ userFound: true, userActive: true, employeeStatus: 'Inactive' })).toBe('denied');
    expect(staffLoginDecision({ userFound: true, userActive: false, employeeStatus: 'Active' })).toBe('denied');
    expect(staffLoginDecision({ userFound: false, userActive: true, employeeStatus: 'Active' })).toBe('denied');
  });

  it('still allows an active user when no employee status was loaded', () => {
    expect(staffLoginDecision({ userFound: true, userActive: true })).toBe('ok');
  });
});
