export type ExpenseKind = 'standard' | 'bike_allowance' | 'cash_advance' | 'handled_elsewhere' | 'system';

export interface ExpenseCatalogEntry {
  id: number;
  name: string;
  kind: ExpenseKind;
  accountId: string | null;
  isActive: boolean;
  requiresVehicle: boolean;
  requiresEmployee: boolean;
  requiresNote: boolean;
  softLimit: number | null;
  managersOnly: boolean;
  helpText: string | null;
  linkPath: string | null;
}

export interface ExpenseEntry {
  date: string;
  amount: number;
  description: string;
  status: 'paid' | 'unpaid';
  hasPaymentMethod: boolean;
  vehicleId: string | null;
  employeeId: string | null;
}

export interface ExpenseGuardContext {
  /** Manila calendar date, YYYY-MM-DD. */
  today: string;
  /** Can log manager-only types, back-date past the window and override accounts. */
  isManager: boolean;
  /** Can lend money to staff (cash advances). */
  canGrantAdvances: boolean;
  /** Current vehicle allowance balance of the chosen employee, for allowance payouts. */
  allowanceBalance?: number | null;
  employeeName?: string | null;
  /** Same type, amount and day already logged (and same employee or vehicle when set). */
  duplicateCount?: number;
}

export type ExpenseConfirmation = 'over_limit' | 'duplicate';

export interface ExpenseGuardResult {
  errors: string[];
  confirmations: Array<{ code: ExpenseConfirmation; message: string }>;
}

/** Staff can only log expenses from the last few days; older ones need a manager. */
export const STAFF_BACKDATE_DAYS = 7;
export const NOTE_MIN_LENGTH = 15;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const php = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Every rule an expense must pass before it is booked. The API enforces this;
 * the web form runs the same checks so staff see problems before saving.
 */
export function checkExpenseEntry(
  category: ExpenseCatalogEntry,
  entry: ExpenseEntry,
  ctx: ExpenseGuardContext,
): ExpenseGuardResult {
  const errors: string[] = [];
  const confirmations: ExpenseGuardResult['confirmations'] = [];

  if (!category.isActive) {
    errors.push(`"${category.name}" is no longer used. Pick another expense type.`);
    return { errors, confirmations };
  }
  if (category.kind === 'system') {
    errors.push(`"${category.name}" is recorded automatically and cannot be logged by hand.`);
    return { errors, confirmations };
  }
  if (category.kind === 'handled_elsewhere') {
    errors.push(category.helpText ?? `"${category.name}" is recorded on another page.`);
    return { errors, confirmations };
  }
  if (category.managersOnly && !ctx.isManager) {
    errors.push(`Only a manager can log "${category.name}".`);
  }
  if (category.kind === 'cash_advance' && !ctx.canGrantAdvances) {
    errors.push('Only a manager can give a cash advance. Staff can request one from their portal.');
  }

  if (!(entry.amount > 0)) errors.push('Enter an amount above zero.');
  if (Math.abs(entry.amount * 100 - Math.round(entry.amount * 100)) > 1e-6) {
    errors.push('Amounts can have at most two decimal places.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    errors.push('Pick a valid date.');
  } else {
    const age = daysBetween(entry.date, ctx.today);
    if (age < 0) errors.push("The date can't be in the future.");
    else if (age > STAFF_BACKDATE_DAYS && !ctx.isManager) {
      errors.push(`Expenses older than ${STAFF_BACKDATE_DAYS} days need a manager to log them.`);
    }
  }

  const note = entry.description.trim();
  if (note.length < 3) errors.push('Say what the expense was for.');
  else if (category.requiresNote && note.length < NOTE_MIN_LENGTH) {
    errors.push(`"${category.name}" needs a fuller description (at least ${NOTE_MIN_LENGTH} characters).`);
  }

  if (category.requiresVehicle && !entry.vehicleId) errors.push('Choose the vehicle this was for.');

  const isPayout = category.kind === 'bike_allowance' || category.kind === 'cash_advance';
  if ((category.requiresEmployee || isPayout) && !entry.employeeId) errors.push('Choose the staff member.');

  if (isPayout && entry.status === 'unpaid') {
    errors.push('Staff payouts must be paid at the time. They cannot be logged as unpaid.');
  }
  if (entry.status === 'paid' && !entry.hasPaymentMethod) errors.push('Choose how it was paid.');

  if (category.kind === 'bike_allowance' && entry.employeeId && ctx.allowanceBalance != null) {
    if (entry.amount > ctx.allowanceBalance + 0.005) {
      const who = ctx.employeeName ?? 'This staff member';
      errors.push(`${php(entry.amount)} is more than ${who}'s bike allowance balance of ${php(Math.max(0, ctx.allowanceBalance))}.`);
    }
  }

  if (category.softLimit != null && entry.amount > category.softLimit) {
    confirmations.push({
      code: 'over_limit',
      message: `${php(entry.amount)} is higher than usual for "${category.name}" (normally up to ${php(category.softLimit)}). Check the amount.`,
    });
  }
  if ((ctx.duplicateCount ?? 0) > 0) {
    confirmations.push({
      code: 'duplicate',
      message: `A "${category.name}" expense for ${php(entry.amount)} is already logged on this day. Make sure this isn't a duplicate.`,
    });
  }

  return { errors, confirmations };
}
