import { describe, it, expect } from 'vitest';
import { checkExpenseEntry, type ExpenseCatalogEntry, type ExpenseEntry } from '../src/services/expense-guards.js';

const meal: ExpenseCatalogEntry = {
  id: 1,
  name: 'Staff Meal',
  kind: 'standard',
  accountId: 'EXP-STAFF-MEAL',
  isActive: true,
  requiresVehicle: false,
  requiresEmployee: false,
  requiresNote: false,
  softLimit: 500,
  managersOnly: false,
  helpText: null,
  linkPath: null,
};

const entry: ExpenseEntry = {
  date: '2026-11-15',
  amount: 250,
  description: 'Lunch for shop crew',
  status: 'paid',
  hasPaymentMethod: true,
  vehicleId: null,
  employeeId: null,
};

const staff = { today: '2026-11-15', isManager: false, canGrantAdvances: false };
const manager = { today: '2026-11-15', isManager: true, canGrantAdvances: true };

describe('checkExpenseEntry', () => {
  it('accepts an ordinary expense', () => {
    expect(checkExpenseEntry(meal, entry, staff)).toEqual({ errors: [], confirmations: [] });
  });

  it('rejects future dates and staff back-dating past a week', () => {
    expect(checkExpenseEntry(meal, { ...entry, date: '2026-11-16' }, staff).errors).toHaveLength(1);
    expect(checkExpenseEntry(meal, { ...entry, date: '2026-11-01' }, staff).errors).toHaveLength(1);
    expect(checkExpenseEntry(meal, { ...entry, date: '2026-11-01' }, manager).errors).toHaveLength(0);
  });

  it('asks for confirmation over the usual amount and on duplicates', () => {
    const r = checkExpenseEntry(meal, { ...entry, amount: 900 }, { ...staff, duplicateCount: 1 });
    expect(r.errors).toEqual([]);
    expect(r.confirmations.map((c) => c.code)).toEqual(['over_limit', 'duplicate']);
  });

  it('blocks manager-only types for staff', () => {
    expect(checkExpenseEntry({ ...meal, managersOnly: true }, entry, staff).errors[0]).toMatch(/Only a manager/);
  });

  it('sends payroll-managed types to their own page', () => {
    const r = checkExpenseEntry(
      { ...meal, kind: 'handled_elsewhere', accountId: null, helpText: 'Log 9pm returns on the timesheet.' },
      entry,
      manager,
    );
    expect(r.errors).toEqual(['Log 9pm returns on the timesheet.']);
  });

  it('needs a fuller note when the type requires one', () => {
    expect(checkExpenseEntry({ ...meal, requiresNote: true }, { ...entry, description: 'misc' }, staff).errors).toHaveLength(1);
  });

  it('stops a bike allowance payout above the balance', () => {
    const bike = { ...meal, kind: 'bike_allowance' as const, softLimit: null };
    const ok = checkExpenseEntry(bike, { ...entry, employeeId: 'e1', amount: 35 }, { ...staff, allowanceBalance: 35 });
    const over = checkExpenseEntry(bike, { ...entry, employeeId: 'e1', amount: 100 }, { ...staff, allowanceBalance: 35, employeeName: 'Reland' });
    expect(ok.errors).toEqual([]);
    expect(over.errors[0]).toMatch(/Reland's bike allowance balance of ₱35\.00/);
  });

  it('requires a staff member and a paid status for payouts', () => {
    const adv = { ...meal, kind: 'cash_advance' as const, softLimit: null };
    const r = checkExpenseEntry(adv, { ...entry, status: 'unpaid' }, manager);
    expect(r.errors).toEqual(expect.arrayContaining([
      'Choose the staff member.',
      expect.stringMatching(/cannot be logged as unpaid/),
    ]));
    expect(checkExpenseEntry(adv, { ...entry, employeeId: 'e1' }, staff).errors[0]).toMatch(/cash advance/);
  });

  it('rejects amounts with more than two decimals', () => {
    expect(checkExpenseEntry(meal, { ...entry, amount: 10.005 }, staff).errors).toHaveLength(1);
  });
});
