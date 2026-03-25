import { getSupabaseClient } from './client.js';
import type { Expense, ExpenseRepository } from '@lolas/domain';

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
  };
}
