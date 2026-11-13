import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../adapters/supabase/client.js';

export interface TipInput {
  amount: number;
  /** Where the tip was received (till, GCash...). */
  accountId: string;
}

export type RawTipLeg = {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  reference_type: 'order_tips';
  reference_id: string;
};

export async function resolveTipsPayableAccount(storeId: string): Promise<string> {
  const candidates = [`TIPS-PAYABLE-${storeId}`, 'TIPS-PAYABLE-store-lolas'];
  const { data, error } = await getSupabaseClient()
    .from('chart_of_accounts')
    .select('id')
    .in('id', candidates)
    .eq('is_active', true);
  if (error) throw new Error(`Failed to look up tips account: ${error.message}`);
  const ids = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const hit = candidates.find((c) => ids.has(c));
  if (!hit) throw new Error('No active TIPS-PAYABLE account — add one in Accounts before recording tips');
  return hit;
}

/**
 * Tip or spare change left by a customer: the money lands in the receiving
 * account and is owed to staff until it is shared out on the end-of-month payslip.
 */
export async function buildTipLegs(
  tip: TipInput | null | undefined,
  storeId: string,
  orderId: string,
  customerName: string,
): Promise<RawTipLeg[]> {
  const amount = Math.round(Number(tip?.amount ?? 0) * 100) / 100;
  if (!tip || amount <= 0) return [];
  const payable = await resolveTipsPayableAccount(storeId);
  const description = `Tip from ${customerName || 'customer'}`;
  return [
    { id: randomUUID(), account_id: tip.accountId, debit: amount, credit: 0, description, reference_type: 'order_tips', reference_id: orderId },
    { id: randomUUID(), account_id: payable, debit: 0, credit: amount, description, reference_type: 'order_tips', reference_id: orderId },
  ];
}
