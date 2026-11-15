import {
  type ConfigRepository,
  type ExpenseRepository,
  type Expense,
  type JournalLeg,
  JournalTransaction,
  Money,
  EntryRejectedError,
  ConfirmationRequiredError,
  checkExpenseEntry,
  round2,
} from '@lolas/domain';
import type { CreateExpenseRequest } from '@lolas/shared';
import { randomUUID } from 'node:crypto';
import { formatManilaDate } from '../../utils/manila-date.js';
import {
  type ExpenseActor,
  allowanceBalance,
  assertOverrideAccount,
  assertVehicle,
  canGrantAdvances,
  countDuplicates,
  isCardMethod,
  isManager,
  loadCategory,
  loadEmployee,
  resolvePaidFrom,
} from './expense-context.js';

export interface CreateExpenseResult {
  expenseId: string;
  kind: string;
}

interface Deps {
  expenses: ExpenseRepository;
  config: ConfigRepository;
}

/**
 * The one way an expense gets logged. The type decides where the money is booked:
 * standard types post to their catalog account, bike allowance payouts draw down the
 * staff member's allowance, and cash advances create a payroll repayment schedule.
 */
export async function createExpense(
  input: CreateExpenseRequest,
  actor: ExpenseActor,
  deps: Deps,
): Promise<CreateExpenseResult> {
  const category = await loadCategory(deps.config, input.storeId, input.categoryId);
  if (!category) throw new EntryRejectedError(['That expense type is no longer available. Refresh the page and pick again.']);

  const employee = input.employeeId ? await loadEmployee(input.employeeId) : null;
  if (employee && !employee.active && category.kind !== 'standard') {
    throw new EntryRejectedError([`${employee.name} is not an active staff member.`]);
  }
  if (input.vehicleId) await assertVehicle(input.storeId, input.vehicleId);

  const balance = category.kind === 'bike_allowance' && input.employeeId ? await allowanceBalance(input.employeeId) : null;
  const duplicateCount = await countDuplicates({
    storeId: input.storeId,
    categoryId: category.id,
    date: input.date,
    amount: input.amount,
    employeeId: input.employeeId,
    vehicleId: input.vehicleId,
  });

  const check = checkExpenseEntry(
    category,
    {
      date: input.date,
      amount: input.amount,
      description: input.description,
      status: input.status,
      hasPaymentMethod: !!input.paymentMethodId,
      vehicleId: input.vehicleId,
      employeeId: input.employeeId,
    },
    {
      today: formatManilaDate(),
      isManager: isManager(actor),
      canGrantAdvances: canGrantAdvances(actor),
      allowanceBalance: balance,
      employeeName: employee?.name,
      duplicateCount,
    },
  );

  if (input.accountOverride) {
    if (!isManager(actor)) check.errors.push('Only a manager can change the account an expense books to.');
    else if (category.kind !== 'standard') check.errors.push('Staff payouts always book to their own account.');
    else await assertOverrideAccount(input.storeId, input.accountOverride.accountId);
  }
  if (category.kind === 'cash_advance' && !input.advance) check.errors.push('Choose how the advance will be repaid.');
  if (category.kind === 'standard' && !category.accountId && !input.accountOverride) {
    check.errors.push(`"${category.name}" has no account set up for this store. Ask a manager to fix it in Settings.`);
  }
  if (input.status === 'paid' && input.paymentMethodId && isCardMethod(input.paymentMethodId)) {
    check.errors.push('Card routes to customer card takings, so it can’t pay an expense. Choose cash, GCash or a bank account.');
  }
  if (check.errors.length) throw new EntryRejectedError(check.errors);

  const pending = check.confirmations.filter(
    (c) => !(c.code === 'duplicate' && input.confirmDuplicate) && !(c.code === 'over_limit' && input.confirmOverLimit),
  );
  if (pending.length) throw new ConfirmationRequiredError(pending);

  const paidFrom = input.status === 'paid' && input.paymentMethodId
    ? await resolvePaidFrom(input.storeId, input.paymentMethodId)
    : null;
  const description = input.description.trim();
  const amount = round2(input.amount);

  if (category.kind === 'bike_allowance') {
    const { withdrawAllowance } = await import('../payroll/vehicle-allowance.js');
    const { expenseId } = await withdrawAllowance(
      { storeId: input.storeId, employeeId: input.employeeId!, date: input.date, amount, paidFromAccountId: paidFrom!, note: description.slice(0, 200) },
      actor.employeeId ?? '',
    );
    return { expenseId, kind: category.kind };
  }

  if (category.kind === 'cash_advance') {
    const { grantCashAdvance } = await import('../hr/grant-cash-advance.js');
    const { expenseId } = await grantCashAdvance(
      {
        storeId: input.storeId,
        employeeId: input.employeeId!,
        amount,
        date: input.date,
        repaymentType: input.advance!.repaymentType,
        deductOn: input.advance!.deductOn,
        periods: input.advance!.periods,
        startPayday: input.advance!.startPayday,
        expenseAccountId: category.accountId!,
        cashAccountId: paidFrom!,
        description,
        createdBy: actor.employeeId,
      },
      { expenses: deps.expenses },
    );
    return { expenseId, kind: category.kind };
  }

  const accountId = input.accountOverride?.accountId ?? category.accountId!;
  const expense: Expense = {
    id: randomUUID(),
    storeId: input.storeId,
    date: input.date,
    category: category.name,
    description,
    amount,
    paidFrom,
    vehicleId: input.vehicleId,
    employeeId: input.employeeId,
    accountId,
    createdAt: new Date(),
  };

  if (input.status === 'unpaid') {
    await deps.expenses.createUnpaid(expense);
    return { expenseId: expense.id, kind: category.kind };
  }

  const memo = input.accountOverride
    ? `${category.name}: ${description} [account changed by manager: ${input.accountOverride.reason}]`
    : `${category.name}: ${description}`;
  await deps.expenses.createWithJournal(
    expense,
    buildExpenseTransaction(expense, paidFrom!, memo, actor.employeeId),
    actor.employeeId,
  );
  return { expenseId: expense.id, kind: category.kind };
}

/** DR the expense account, CR the account it was paid from, dated on the expense date. */
export function buildExpenseTransaction(
  expense: Expense,
  paidFrom: string,
  memo: string,
  createdBy: string | null,
): JournalTransaction {
  const money = Money.php(expense.amount);
  const legs: JournalLeg[] = [
    { entryId: randomUUID(), accountId: expense.accountId!, debit: money, credit: Money.zero(), description: memo, referenceType: 'expense', referenceId: expense.id },
    { entryId: randomUUID(), accountId: paidFrom, debit: Money.zero(), credit: money, description: memo, referenceType: 'expense', referenceId: expense.id },
  ];
  return JournalTransaction.create({
    transactionId: randomUUID(),
    period: expense.date.slice(0, 7),
    date: expense.date,
    storeId: expense.storeId,
    legs,
    createdBy,
  });
}
