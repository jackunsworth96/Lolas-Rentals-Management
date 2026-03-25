import { getSupabaseClient } from './client.js';
import type { MiscSale, MiscSaleRepository } from '@lolas/domain';

function toRow(s: MiscSale) {
  return {
    id: s.id,
    store_id: s.storeId,
    date: s.date,
    description: s.description,
    category: s.category,
    amount: s.amount,
    received_into: s.receivedInto,
    income_account_id: s.incomeAccountId,
    employee_id: s.employeeId,
  };
}

function toDomain(row: Record<string, unknown>): MiscSale {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    date: row.date as string,
    description: row.description as string | null,
    category: row.category as string | null,
    amount: Number(row.amount ?? 0),
    receivedInto: row.received_into as string | null,
    incomeAccountId: row.income_account_id as string | null,
    employeeId: row.employee_id as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

export function createMiscSaleRepo(): MiscSaleRepository {
  const sb = getSupabaseClient();

  return {
    async findById(id) {
      const { data, error } = await sb
        .from('misc_sales')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`Failed to fetch misc sale: ${error.message}`);
      return data ? toDomain(data) : null;
    },

    async findByStore(storeId, date) {
      const { data, error } = await sb
        .from('misc_sales')
        .select('*')
        .eq('store_id', storeId)
        .eq('date', date)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Failed to fetch misc sales: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(sale) {
      const { error } = await sb.from('misc_sales').upsert(toRow(sale));
      if (error) throw new Error(`Failed to save misc sale: ${error.message}`);
    },

    async delete(id) {
      const { error } = await sb.from('misc_sales').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete misc sale: ${error.message}`);
    },
  };
}
