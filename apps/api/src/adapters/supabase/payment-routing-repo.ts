import { getSupabaseClient } from './client.js';
import type { PaymentRoutingRule, PaymentRoutingRepository } from '@lolas/domain';

function toDomain(row: Record<string, unknown>): PaymentRoutingRule {
  return {
    id: Number(row.id),
    storeId: row.store_id as string,
    paymentMethodId: row.payment_method_id as string,
    receivedIntoAccountId: (row.received_into_account_id as string) ?? null,
    cardSettlementAccountId: (row.card_settlement_account_id as string) ?? null,
  };
}

function toRow(rule: Omit<PaymentRoutingRule, 'id'>) {
  return {
    store_id: rule.storeId,
    payment_method_id: rule.paymentMethodId,
    received_into_account_id: rule.receivedIntoAccountId || null,
    card_settlement_account_id: rule.cardSettlementAccountId || null,
    updated_at: new Date().toISOString(),
  };
}

export function createPaymentRoutingRepo(): PaymentRoutingRepository {
  const sb = getSupabaseClient();

  return {
    async findAll() {
      const { data, error } = await sb
        .from('payment_routing_rules')
        .select('*')
        .order('store_id')
        .order('payment_method_id');
      if (error) throw new Error(`Failed to fetch routing rules: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async findByStore(storeId) {
      const { data, error } = await sb
        .from('payment_routing_rules')
        .select('*')
        .eq('store_id', storeId)
        .order('payment_method_id');
      if (error) throw new Error(`Failed to fetch routing rules: ${error.message}`);
      return (data ?? []).map(toDomain);
    },

    async upsert(rule) {
      const { data, error } = await sb
        .from('payment_routing_rules')
        .upsert(toRow(rule), { onConflict: 'store_id,payment_method_id' })
        .select('*')
        .single();
      if (error) throw new Error(`Failed to upsert routing rule: ${error.message}`);
      return toDomain(data);
    },

    async bulkUpsert(rules) {
      if (rules.length === 0) return;
      const rows = rules.map(toRow);
      const { error } = await sb
        .from('payment_routing_rules')
        .upsert(rows, { onConflict: 'store_id,payment_method_id' });
      if (error) throw new Error(`Failed to bulk upsert routing rules: ${error.message}`);
    },

    async delete(id) {
      const { error } = await sb
        .from('payment_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw new Error(`Failed to delete routing rule: ${error.message}`);
    },
  };
}
