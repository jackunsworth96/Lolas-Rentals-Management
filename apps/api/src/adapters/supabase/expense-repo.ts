import { getSupabaseClient } from './client.js';
import type { Expense, ExpenseRepository, JournalTransaction } from '@lolas/domain';

function toRow(e: Expense) {
  return {
    id: e.id,
    store_id: e.storeId,
    date: e.date,
    category: e.category,
    description: e.description,
    amount: e.amount,
    paid_from: e.paidFrom,
    vehicle_id: e.vehicleId,
    employee_id: e.employeeId,
    account_id: e.accountId,
  };
}

function toDomain(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    date: row.date as string,
    category: row.category as string,
    description: row.description as string,
    amount: Number(row.amount ?? 0),
    paidFrom: row.paid_from as string | null,
    vehicleId: row.vehicle_id as string | null,
    employeeId: row.employee_id as string | null,
    accountId: row.account_id as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

export function createExpenseRepo(): ExpenseRepository {
  const sb = getSupabaseClient();

  return {
    async findById(id) {
      const { data, error } = await sb
        .from('expenses')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch expense: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async findByStore(storeId, date) {
      const { data, error } = await sb
        .from('expenses')
        .select('*')
        .eq('store_id', storeId)
        .eq('date', date)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to fetch expenses: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByCategory(storeId, category) {
      const { data, error } = await sb
        .from('expenses')
        .select('*')
        .eq('store_id', storeId)
        .eq('category', category);
      if (error) throw new Error(`Failed to fetch expenses by category: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(expense) {
      const { error } = await sb.from('expenses').upsert(toRow(expense));
      if (error) throw new Error(`Failed to save expense: ${error.message}`);
    },

    async delete(id) {
      const { error } = await sb.from('expenses').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete expense: ${error.message}`);
    },

    async createWithJournal(expense, transaction, createdBy) {
      const row = toRow(expense);

      const legs = transaction.legs.map((leg) => ({
        id: leg.entryId,
        account_id: leg.accountId,
        debit: leg.debit.toNumber(),
        credit: leg.credit.toNumber(),
        description: leg.description,
        reference_type: leg.referenceType,
        reference_id: leg.referenceId,
      }));

      const { error } = await sb.rpc('create_expense_with_journal', {
        p_expense_id:       row.id,
        p_store_id:         row.store_id,
        p_date:             row.date,
        p_category:         row.category,
        p_description:      row.description ?? null,
        p_amount:           row.amount,
        p_paid_from:        row.paid_from ?? null,
        p_vehicle_id:       row.vehicle_id ?? null,
        p_employee_id:      row.employee_id ?? null,
        p_account_id:       row.account_id ?? null,
        p_transaction_id:   transaction.transactionId,
        p_period:           transaction.period,
        p_journal_date:     transaction.date,
        p_journal_store_id: transaction.storeId,
        p_created_by:       createdBy,
        p_legs:             legs,
      });

      if (error) throw new Error(`create_expense_with_journal failed: ${error.message}`);
    },

    async deleteWithJournal(expenseId, referenceType, referenceId) {
      const { error } = await sb.rpc('delete_expense_with_journal', {
        p_expense_id:     expenseId,
        p_reference_type: referenceType,
        p_reference_id:   referenceId,
      });

      if (error) throw new Error(`delete_expense_with_journal failed: ${error.message}`);
    },
  };
}
