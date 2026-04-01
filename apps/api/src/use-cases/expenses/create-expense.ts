import {
  type ExpenseRepository,
  type Expense,
  type JournalLeg,
  JournalTransaction,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface CreateExpenseInput {
  storeId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidFrom: string | null;
  vehicleId: string | null;
  employeeId: string | null;
  expenseAccountId: string;
  cashAccountId: string;
  status?: 'paid' | 'unpaid';
}

export interface CreateExpenseResult {
  expense: Expense;
}

export async function createExpense(
  input: CreateExpenseInput,
  deps: { expenses: ExpenseRepository },
): Promise<CreateExpenseResult> {
  if (input.amount <= 0) {
    throw new DomainError('Expense amount must be positive');
  }

  const expense: Expense = {
    id: randomUUID(),
    storeId: input.storeId,
    date: input.date,
    category: input.category,
    description: input.description,
    amount: input.amount,
    paidFrom: input.paidFrom,
    vehicleId: input.vehicleId,
    employeeId: input.employeeId,
    accountId: input.expenseAccountId,
    createdAt: new Date(),
  };

  const amount = Money.php(input.amount);
  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.expenseAccountId,
      debit: amount,
      credit: Money.zero(),
      description: `${input.category}: ${input.description}`,
      referenceType: 'expense',
      referenceId: expense.id,
    },
    {
      entryId: randomUUID(),
      accountId: input.cashAccountId,
      debit: Money.zero(),
      credit: amount,
      description: `${input.category}: ${input.description}`,
      referenceType: 'expense',
      referenceId: expense.id,
    },
  ];

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const period = date.slice(0, 7);

  const transaction = JournalTransaction.create({
    transactionId: randomUUID(),
    period,
    date,
    storeId: input.storeId,
    legs,
    createdBy: null,
  });

  if (input.status === 'unpaid') {
    await deps.expenses.createUnpaid(expense);
  } else {
    await deps.expenses.createWithJournal(expense, transaction, null);
  }

  return { expense };
}
