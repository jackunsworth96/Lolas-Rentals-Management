import { getSupabaseClient } from './client.js';
import type { Payment, PaymentRepository } from '@lolas/domain';

function toRow(p: Payment) {
  return {
    id: p.id,
    store_id: p.storeId,
    order_id: p.orderId,
    raw_order_id: p.rawOrderId,
    order_item_id: p.orderItemId,
    order_addon_id: p.orderAddonId,
    payment_type: p.paymentType,
    amount: p.amount,
    payment_method_id: p.paymentMethodId,
    transaction_date: p.transactionDate,
    settlement_status: p.settlementStatus,
    settlement_ref: p.settlementRef,
    customer_id: p.customerId,
    account_id: p.accountId,
  };
}

function toDomain(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    orderId: (row.order_id as string) ?? null,
    rawOrderId: (row.raw_order_id as string) ?? null,
    orderItemId: row.order_item_id as string | null,
    orderAddonId: row.order_addon_id as string | null,
    paymentType: row.payment_type as string,
    amount: row.amount as number,
    paymentMethodId: row.payment_method_id as string,
    transactionDate: row.transaction_date as string,
    settlementStatus: row.settlement_status as string | null,
    settlementRef: row.settlement_ref as string | null,
    customerId: row.customer_id as string | null,
    accountId: row.account_id as string | null,
  };
}

export function createPaymentRepo(): PaymentRepository {
  const sb = getSupabaseClient();

  return {
    async findByOrderId(orderId) {
      const { data, error } = await sb
        .from('payments')
        .select('*')
        .eq('order_id', orderId);
      if (error) throw new Error(`Failed to fetch payments by order: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByRawOrderId(rawOrderId) {
      const { data, error } = await sb
        .from('payments')
        .select('*')
        .eq('raw_order_id', rawOrderId);
      if (error) throw new Error(`Failed to fetch payments by raw order: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async linkToOrder(rawOrderId, orderId) {
      const { error } = await sb
        .from('payments')
        .update({ order_id: orderId })
        .eq('raw_order_id', rawOrderId);
      if (error) throw new Error(`Failed to link payments to order: ${error.message}`);
    },

    async findByDateRange(storeId, from, to) {
      const { data, error } = await sb
        .from('payments')
        .select('*')
        .eq('store_id', storeId)
        .gte('transaction_date', from)
        .lte('transaction_date', to);
      if (error) throw new Error(`Failed to fetch payments by date range: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async save(payment) {
      const { error } = await sb.from('payments').upsert(toRow(payment));
      if (error) throw new Error(`Failed to save payment: ${error.message}`);
    },
  };
}
