import { supabase } from '../adapters/supabase/client.js';

function generateWalkInReference(source: string): string {
  const prefix = source === 'bass' ? 'BB' : 'LR';
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `${prefix}-${m}${d}-${hex}`;
}

export async function uniqueWalkInReference(source: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = generateWalkInReference(source);
    const { data } = await supabase.from('orders_raw').select('id').eq('order_reference', ref).maybeSingle();
    if (!data) return ref;
  }
  return generateWalkInReference(source);
}
