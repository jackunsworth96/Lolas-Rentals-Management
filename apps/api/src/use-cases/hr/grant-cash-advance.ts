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
export type PaydayType = 'mid_month' | 'end_of_month';

export interface GrantCashAdvanceInput {
  storeId: string;
  employeeId: string;
  amount: number;
  date: string;
  repaymentType: RepaymentType;
  /** Lump-sum: which payday to deduct the full amount on. Defaults to 'end_of_month'. */
  deductOn?: PaydayType;
  /** Installments: number of payroll periods to split across. Required when repaymentType is 'installments'. */
  periods?: number;
  /** Installments: which payday to start deductions from. Defaults to 'end_of_month'. */
  startPayday?: PaydayType;
  /** COA account ID for the expense (e.g. "Staff Advances" asset account). */
  expenseAccountId: string;
  /** COA account ID for the cash source (till or safe). */
  cashAccountId: string;
  description?: string;
}

export interface GrantCashAdvanceResult {
  expenseId: string;
  scheduleIds: string[];
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

  // --- Payroll deduction schedule ---
  // All advances are stored as schedule rows. Each row represents one
  // scheduled deduction on a specific payday (mid_month = 15th, end_of_month = last day).
  const paydays: PaydayType[] = ['mid_month', 'end_of_month'];
  const scheduleRows: Array<Record<string, unknown>> = [];

  if (input.repaymentType === 'lump-sum') {
    const paydayType: PaydayType = input.deductOn ?? 'end_of_month';
    const id = randomUUID();
    scheduleRows.push({
      id,
      employee_id: input.employeeId,
      expense_id: expenseId,
      total_amount: input.amount,
      granted_date: input.date,
      installment_amount: input.amount,
      period_start: input.date,
      period_end: input.date,
      deduction_per_period: input.amount,
      remaining_balance: input.amount,
      start_date: input.date,
      payday_type: paydayType,
    });
  } else {
    const periods = input.periods!;
    const deductionPerPeriod = Math.round((input.amount / periods) * 100) / 100;
    const startPayday: PaydayType = input.startPayday ?? 'end_of_month';
    const startIdx = startPayday === 'mid_month' ? 0 : 1;

    for (let i = 0; i < periods; i++) {
      const paydayType = paydays[(startIdx + i) % 2];
      scheduleRows.push({
        id: randomUUID(),
        employee_id: input.employeeId,
        expense_id: expenseId,
        total_amount: input.amount,
        granted_date: input.date,
        installment_amount: deductionPerPeriod,
        period_start: input.date,
        period_end: input.date,
        deduction_per_period: deductionPerPeriod,
        remaining_balance: deductionPerPeriod,
        start_date: input.date,
        payday_type: paydayType,
      });
    }
  }

  const { error } = await sb.from('cash_advance_schedules').insert(scheduleRows);
  if (error) {
    throw new Error(`Failed to create cash advance schedule: ${error.message}`);
  }

  return {
    expenseId,
    scheduleIds: scheduleRows.map((r) => String(r.id)),
  };
}
