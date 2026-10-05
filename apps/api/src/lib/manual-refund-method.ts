import { supabase } from '../adapters/supabase/client.js';

export async function assertManualRefundMethod(methodId: string): Promise<void> {
  const { data, error } = await supabase.from('payment_methods')
    .select('id, name, gateway_provider, is_active')
    .eq('id', methodId)
    .maybeSingle();
  if (error) throw new Error(`Refund method lookup failed: ${error.message}`);
  const label = `${data?.id ?? ''} ${data?.name ?? ''}`.toLowerCase();
  if (!data || data.is_active === false || data.gateway_provider || /card|visa|master|xendit/.test(label)) {
    throw new Error('Card and gateway refunds must use a verified provider refund workflow');
  }
}
