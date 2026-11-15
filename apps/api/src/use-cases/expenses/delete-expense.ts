import { type ExpenseRepository, EntryRejectedError } from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import type { ExpenseActor } from './expense-context.js';
import { assertCanChange, loadStoredExpense } from './update-expense.js';

export async function deleteExpense(
  expenseId: string,
  actor: ExpenseActor,
  deps: { expenses: ExpenseRepository },
): Promise<void> {
  const expense = await loadStoredExpense(expenseId);
  assertCanChange(expense, actor, 'delete');

  const { data, error } = await getSupabaseClient()
    .from('expenses')
    .select('timesheet_id, maintenance_id')
    .eq('id', expenseId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load expense links: ${error.message}`);
  if (data?.timesheet_id) {
    throw new EntryRejectedError(['This is a 9pm return payout. Remove it from the timesheet instead so payroll stays correct.']);
  }
  if (data?.maintenance_id) {
    throw new EntryRejectedError(['This cost belongs to a maintenance job. Change it on the Maintenance page instead.']);
  }

  // Allowance ledger rows cascade with the expense, restoring the staff member's balance.
  try {
    await deps.expenses.deleteWithJournal(expenseId, 'expense', expenseId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('partly repaid')) {
      throw new EntryRejectedError(['This cash advance has already been partly repaid through payroll, so it can’t be deleted.']);
    }
    throw err;
  }
}
