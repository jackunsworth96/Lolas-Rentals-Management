import type { CashReconciliation } from '@lolas/domain';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendTelegramAlert, getTelegramChatId } from '../lib/telegram.js';
import { escapeHtml } from '../services/email.js';

function peso(n: number | null | undefined): string {
  return `₱${Number(n ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function signed(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v === 0) return '✅ balanced';
  return `${v > 0 ? '⬆️ over' : '⬇️ short'} ${peso(Math.abs(v))}`;
}

/** One message per locked cash-up so managers see variances and explanations as they happen. */
export async function sendCashupLockedTelegram(r: CashReconciliation): Promise<void> {
  const chatId = getTelegramChatId('daily');
  if (!chatId) return;

  const sb = getSupabaseClient();
  const [{ data: store }, { data: employee }] = await Promise.all([
    sb.from('stores').select('name').eq('id', r.storeId).maybeSingle(),
    r.submittedBy
      ? sb.from('employees').select('full_name').eq('id', r.submittedBy).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const storeName = (store as { name?: string } | null)?.name ?? r.storeId;
  const by = (employee as { full_name?: string } | null)?.full_name ?? 'staff';

  const lines = [
    `🧮 <b>Cash-up locked — ${escapeHtml(storeName)} — ${escapeHtml(r.date)}</b>`,
    `By ${escapeHtml(by)}`,
    `<b>Till:</b> counted ${peso(r.tillCounted)} vs expected ${peso(r.tillExpected)} — ${signed(r.tillVariance)}`,
    `<b>Envelope:</b> counted ${peso(r.depositsCounted)} vs expected ${peso(r.depositsExpected)} — ${signed(r.depositVariance)}`,
  ];
  if (r.varianceNote) lines.push(`📝 ${escapeHtml(r.varianceNote)}`);
  if (r.overrideReason) lines.push(`🔓 Previously reopened: ${escapeHtml(r.overrideReason)}`);

  await sendTelegramAlert(lines.join('\n'), chatId);
}
