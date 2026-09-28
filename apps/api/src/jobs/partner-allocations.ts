import cron from 'node-cron';
import { getSupabaseClient } from '../adapters/supabase/client.js';
export async function generatePartnerAllocations() {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('partner_allocation_tiers').select('store_id');
  if (error) throw new Error(error.message);
  const until = new Date(); until.setUTCMonth(until.getUTCMonth() + 24);
  for (const store of new Set((data ?? []).map((r) => r.store_id))) {
    const { error: generationError } = await sb.rpc('allocation_generate', { p_store: store, p_until: until.toISOString().slice(0, 10) });
    if (generationError) console.error('[allocation-generation]', store, generationError.message);
  }
}
export function startPartnerAllocationJob() {
  cron.schedule('10 0 * * *', () => { void generatePartnerAllocations().catch((err) => console.error('[allocation-generation]', err)); }, { timezone: 'Asia/Manila' });
}
