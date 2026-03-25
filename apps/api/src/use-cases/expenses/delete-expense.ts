import { type ExpenseRepository, type AccountingPort, DomainError } from '@lolas/domain';

export interface DeleteExpenseInput {
  expenseId: string;
}

export async function deleteExpense(
  input: DeleteExpenseInput,
  deps: { expenses: ExpenseRepository; accounting: AccountingPort },
): Promise<void> {
  if (!input.expenseId) {
    throw new DomainError('Expense ID is required');
  }

  const expense = await deps.expenses.findById(input.expenseId);
  if (!expense) {
    throw new DomainError('Expense not found');
  }

  await deps.accounting.deleteByReference('expense', expense.id);
  await deps.expenses.delete(input.expenseId);
}
