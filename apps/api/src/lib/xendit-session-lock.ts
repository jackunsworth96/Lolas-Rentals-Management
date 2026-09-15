import { getSupabaseClient } from '../adapters/supabase/client.js';

export type LiveXenditSession = {
  id: string;
  target_type: string;
  status: 'creating' | 'active' | 'reconciliation_required';
  payment_session_id: string | null;
  payment_link_url: string | null;
  expires_at: string | null;
  store_id: string;
};

// Reconciliation-required sessions are terminal but intentionally remain
// non-payable until finance resolves the provider-confirmed outcome.
const LIVE_STATUSES = ['creating', 'active', 'reconciliation_required'] as const;

export async function findLiveXenditSessionForRawOrder(rawOrderId: string): Promise<LiveXenditSession | null> {
  const { data, error } = await getSupabaseClient()
    .from('xendit_payment_session_orders')
    .select('xendit_payment_sessions!inner(id, target_type, status, payment_session_id, payment_link_url, expires_at, store_id)')
    .eq('raw_order_id', rawOrderId)
    .in('xendit_payment_sessions.status', LIVE_STATUSES)
    .maybeSingle();
  if (error) throw new Error(`Failed to inspect raw-order Xendit session: ${error.message}`);
  return (data?.xendit_payment_sessions ?? null) as LiveXenditSession | null;
}

export async function findLiveXenditSessionForOrder(orderId: string): Promise<LiveXenditSession | null> {
  const { data, error } = await getSupabaseClient()
    .from('xendit_payment_sessions')
    .select('id, target_type, status, payment_session_id, payment_link_url, expires_at, store_id')
    .eq('order_id', orderId)
    .in('status', LIVE_STATUSES)
    .maybeSingle();
  if (error) throw new Error(`Failed to inspect order Xendit session: ${error.message}`);
  return data as LiveXenditSession | null;
}

export function paymentInProgressError() {
  return {
    success: false,
    error: {
      code: 'PAYMENT_ALREADY_IN_PROGRESS',
      message: 'A Xendit payment checkout is in progress. Cancel or reconcile it before changing this booking.',
    },
  };
}
