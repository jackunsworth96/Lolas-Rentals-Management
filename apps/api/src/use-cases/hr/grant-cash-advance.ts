import {
  type ExpenseRepository,
  type Expense,
  type JournalLeg,
  JournalTransaction,
  Money,
  DomainError,
} from '@lolas/domain';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { randomUUID } from 'node:crypto';
import { formatManilaDate } from '../../utils/manila-date.js';

export type RepaymentType = 'lump-sum' | 'installments';

export interface GrantCashAdvanceInput {
  storeId: string;
  employeeId: string;
  amount: number;
  date: string;
  repaymentType: RepaymentType;
  /** Number of payroll periods to split across — required when repaymentType is 'installments'. */
  periods?: number;
  /** COA account ID for the expense (e.g. "Staff Advances" asset account). */
  expenseAccountId: string;
  /** COA account ID for the cash source (till or safe). */
  cashAccountId: string;
  description?: string;
}

export interface GrantCashAdvanceResult {
  expenseId: string;
  scheduleId: string | null;
}

export async function grantCashAdvance(
  input: GrantCashAdvanceInput,
  deps: { expenses: ExpenseRepository },
): Promise<GrantCashAdvanceResult> {
  if (input.amount <= 0) {
    throw new DomainError('Cash advance amount must be positive');
  }

  if (input.repaymentType === 'installments') {
    if (!input.periods || input.periods < 2) {
      throw new DomainError('Installment advances require at least 2 periods');
    }
  }

  const sb = getSupabaseClient();
  const expenseId = randomUUID();
  const description = input.description?.trim() || 'Cash advance to employee';

  // --- Expense record + journal entry (cash going out) ---
  const expense: Expense = {
    id: expenseId,
    storeId: input.storeId,
    date: input.date,
    category: 'Cash Advance',
    description,
    amount: input.amount,
    paidFrom: input.cashAccountId,
    vehicleId: null,
    employeeId: input.employeeId,
    accountId: input.expenseAccountId,
    createdAt: new Date(),
  };

  const money = Money.php(input.amount);
  const txDate = formatManilaDate();
  const period = txDate.slice(0, 7);

  const legs: JournalLeg[] = [
    {
      entryId: randomUUID(),
      accountId: input.expenseAccountId,
      debit: money,
      credit: Money.zero(),
      description: `Cash Advance: ${description}`,
      referenceType: 'expense',
      referenceId: expenseId,
    },
    {
      entryId: randomUUID(),
      accountId: input.cashAccountId,
      debit: Money.zero(),
      credit: money,
      description: `Cash Advance: ${description}`,
      referenceType: 'expense',
      referenceId: expenseId,
    },
  ];

  const transaction = JournalTransaction.create({
    transactionId: randomUUID(),
    period,
    date: txDate,
    storeId: input.storeId,
    legs,
    createdBy: null,
  });

  await deps.expenses.createWithJournal(expense, transaction, null);

  // --- Payroll deduction setup ---
  let scheduleId: string | null = null;

  if (input.repaymentType === 'lump-sum') {
    // Increment employees.current_cash_advance so it deducts at next end-of-month run
    const { error } = await sb.rpc('increment_cash_advance', {
      p_employee_id: input.employeeId,
      p_amount: input.amount,
    });
    if (error) {
      throw new Error(`Failed to update employee cash advance balance: ${error.message}`);
    }
  } else {
    // Create a schedule row that payroll deducts from each period until balance is 0
    const periods = input.periods!;
    const deductionPerPeriod = Math.round((input.amount / periods) * 100) / 100;
    scheduleId = randomUUID();

    const { error } = await sb.from('cash_advance_schedules').insert({
      id: scheduleId,
      employee_id: input.employeeId,
      expense_id: expenseId,
      total_amount: input.amount,
      granted_date: input.date,
      // Legacy columns (kept for backward compat, not read by adapter)
      installment_amount: deductionPerPeriod,
      period_start: input.date,
      period_end: input.date,
      // Adapter columns
      deduction_per_period: deductionPerPeriod,
      remaining_balance: input.amount,
      start_date: input.date,
    });

    if (error) {
      throw new Error(`Failed to create cash advance schedule: ${error.message}`);
    }
  }

  return { expenseId, scheduleId };
}
