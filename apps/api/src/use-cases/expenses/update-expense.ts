import {
  type ExpenseRepository,
  type AccountingPort,
  type Expense,
  type JournalLeg,
  Money,
  DomainError,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface UpdateExpenseInput {
  expenseId: string;
  date?: string;
  category?: string;
  description?: string;
  amount?: number;
  paidFrom?: string | null;
  vehicleId?: string | null;
  employeeId?: string | null;
  expenseAccountId?: string;
  cashAccountId?: string;
}

export async function updateExpense(
  input: UpdateExpenseInput,
  deps: { expenses: ExpenseRepository; accounting: AccountingPort },
): Promise<{ expense: Expense }> {
  const existing = await deps.expenses.findById(input.expenseId);
  if (!existing) {
    throw new DomainError('Expense not found');
  }

  const updated: Expense = {
    ...existing,
    date: input.date ?? existing.date,
    category: input.category ?? existing.category,
    description: input.description ?? existing.description,
    amount: input.amount ?? existing.amount,
    paidFrom: input.paidFrom !== undefined ? input.paidFrom : existing.paidFrom,
    vehicleId: input.vehicleId !== undefined ? input.vehicleId : existing.vehicleId,
    employeeId: input.employeeId !== undefined ? input.employeeId : existing.employeeId,
    accountId: input.expenseAccountId ?? existing.accountId,
  };

  if (updated.amount <= 0) {
    throw new DomainError('Expense amount must be positive');
  }

  await deps.expenses.save(updated);

  // Replace journal entries: delete old, create new
  await deps.accounting.deleteByReference('expense', existing.id);

  const expenseAccountId = input.expenseAccountId ?? existing.accountId;
  const cashAccountId = input.cashAccountId ?? existing.paidFrom;
  if (expenseAccountId && cashAccountId) {
    const amount = Money.php(updated.amount);
    const desc = `${updated.category}: ${updated.description}`;
    const legs: JournalLeg[] = [
      {
        entryId: randomUUID(),
        accountId: expenseAccountId,
        debit: amount,
        credit: Money.zero(),
        description: desc,
        referenceType: 'expense',
        referenceId: existing.id,
      },
      {
        entryId: randomUUID(),
        accountId: cashAccountId,
        debit: Money.zero(),
        credit: amount,
        description: desc,
        referenceType: 'expense',
        referenceId: existing.id,
      },
    ];

    await deps.accounting.createTransaction(legs, existing.storeId);
  }

  return { expense: updated };
}
