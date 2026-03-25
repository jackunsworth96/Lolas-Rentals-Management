import { getSupabaseClient } from './client.js';
import type { CardSettlement, CardSettlementRepository, SettleManyFields } from '@lolas/domain';
import { addBusinessDays } from '../../utils/business-days.js';

function toDomain(row: Record<string, unknown>): CardSettlement {
  const customerRow = row.customers as { name: string } | null;
  const rawDate = row.raw_date as string | null;
  const createdAt = row.created_at as string;
  const txDate = rawDate ?? createdAt?.slice(0, 10) ?? null;

  return {
    id: String(row.id),
    storeId: row.store_id as string,
    orderId: row.order_id as string | null,
    customerId: row.customer_id as string | null,
    paymentId: null,
    name: (row.name as string | null) ?? customerRow?.name ?? null,
    amount: Number(row.amount ?? 0),
    refNumber: row.ref_number as string | null,
    transactionDate: txDate,
    forecastedDate: (row.forecasted_date as string | null) ?? (txDate ? addBusinessDays(txDate, 3) : null),
    isPaid: !!(row.is_paid),
    dateSettled: row.date_settled as string | null,
    settlementRef: row.settlement_ref as string | null,
    netAmount: row.net_amount != null ? Number(row.net_amount) : null,
    feeExpense: row.fee_expense != null ? Number(row.fee_expense) : null,
    accountId: row.account_id as string | null,
    batchNo: row.batch_no as string | null,
    createdAt: new Date(createdAt),
  };
}

function toInsertRow(s: CardSettlement): Record<string, unknown> {
  return {
    store_id: s.storeId,
    order_id: s.orderId,
    customer_id: s.customerId,
    name: s.name,
    amount: s.amount,
    ref_number: s.refNumber,
    raw_date: s.transactionDate,
    forecasted_date: s.forecastedDate,
    is_paid: s.isPaid,
    date_settled: s.dateSettled,
    settlement_ref: s.settlementRef,
    net_amount: s.netAmount,
    fee_expense: s.feeExpense,
    account_id: s.accountId,
    batch_no: s.batchNo,
  };
}

function toIntIds(ids: string[]): number[] {
  return ids.map((id) => Number(id));
}

export function createCardSettlementRepo(): CardSettlementRepository {
  const sb = getSupabaseClient();

  return {
    async findPending(storeId) {
      let query = sb
        .from('card_settlements')
        .select('*, customers(name)')
        .eq('is_paid', false)
        .order('created_at', { ascending: false });
      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query;
      if (error) throw new Error(`findPending failed: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findSettled(storeId, from, to) {
      let query = sb
        .from('card_settlements')
        .select('*, customers(name)')
        .eq('is_paid', true)
        .order('date_settled', { ascending: false });
      if (storeId && storeId !== 'all') {
        query = query.eq('store_id', storeId);
      }
      if (from) query = query.gte('date_settled', from);
      if (to) query = query.lte('date_settled', to);
      const { data, error } = await query;
      if (error) throw new Error(`findSettled failed: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await sb
        .from('card_settlements')
        .select('*, customers(name)')
        .in('id', toIntIds(ids));
      if (error) throw new Error(`findByIds failed: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByOrder(orderId) {
      const { data, error } = await sb
        .from('card_settlements')
        .select('*')
        .eq('order_id', orderId);
      if (error) throw new Error(`findByOrder failed: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(settlement) {
      const { error } = await sb.from('card_settlements').insert(toInsertRow(settlement));
      if (error) throw new Error(`save failed: ${error.message}`);
    },

    async settleMany(ids, fields) {
      const { error } = await sb
        .from('card_settlements')
        .update({
          is_paid: fields.isPaid,
          date_settled: fields.dateSettled,
          settlement_ref: fields.settlementRef,
          net_amount: fields.netAmount,
          fee_expense: fields.feeExpense,
          account_id: fields.accountId,
        })
        .in('id', toIntIds(ids));
      if (error) throw new Error(`settleMany failed: ${error.message}`);
    },

    async batchUpdate(ids, fields) {
      const patch: Record<string, unknown> = {};
      if (fields.forecastedDate !== undefined) patch.forecasted_date = fields.forecastedDate;
      if (fields.settlementRef !== undefined) patch.settlement_ref = fields.settlementRef;
      if (Object.keys(patch).length === 0) return;
      const { error } = await sb.from('card_settlements').update(patch).in('id', toIntIds(ids));
      if (error) throw new Error(`batchUpdate failed: ${error.message}`);
    },

    async assignBatch(ids, batchNo) {
      const { error } = await sb
        .from('card_settlements')
        .update({ batch_no: batchNo })
        .in('id', toIntIds(ids));
      if (error) throw new Error(`assignBatch failed: ${error.message}`);
    },

    async pendingTotals() {
      const { data, error } = await sb
        .from('card_settlements')
        .select('store_id, amount')
        .eq('is_paid', false);
      if (error) throw new Error(`pendingTotals failed: ${error.message}`);
      const rows = (data ?? []) as { store_id: string; amount: number }[];
      const byStore: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const amt = Number(r.amount ?? 0);
        total += amt;
        byStore[r.store_id] = (byStore[r.store_id] ?? 0) + amt;
      }
      return { total, byStore };
    },
  };
}
