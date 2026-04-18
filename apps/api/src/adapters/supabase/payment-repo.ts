import { z } from 'zod';
import { getSupabaseClient } from './client.js';
import type { Payment, PaymentRepository } from '@lolas/domain';

const PaymentRowSchema = z.object({
  id: z.string(),
  store_id: z.string(),
  order_id: z.string().nullable(),
  raw_order_id: z.string().nullable(),
  order_item_id: z.string().nullable(),
  order_addon_id: z.string().nullable(),
  payment_type: z.string(),
  amount: z.number(),
  payment_method_id: z.string(),
  transaction_date: z.string(),
  settlement_status: z.string().nullable(),
  settlement_ref: z.string().nullable(),
  customer_id: z.string().nullable(),
  account_id: z.string().nullable(),
});

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

function toDomain(raw: unknown): Payment {
  const result = PaymentRowSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid PaymentRow from Supabase: ' + result.error.message);
  }
  const row = result.data;
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    rawOrderId: row.raw_order_id,
    orderItemId: row.order_item_id,
    orderAddonId: row.order_addon_id,
    paymentType: row.payment_type,
    amount: row.amount,
    paymentMethodId: row.payment_method_id,
    transactionDate: row.transaction_date,
    settlementStatus: row.settlement_status,
    settlementRef: row.settlement_ref,
    customerId: row.customer_id,
    accountId: row.account_id,
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
