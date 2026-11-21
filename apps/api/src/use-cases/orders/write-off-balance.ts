import { randomUUID } from 'node:crypto';
import { supabase } from '../../adapters/supabase/client.js';
import { resolveStoreAccounts } from '../../adapters/supabase/maintenance-expense-rpc.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface WriteOffBalanceInput {
  orderId: string;
  amount: number;
  reason: string;
  employeeId: string | null;
}

function badRequest(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode });
}

export async function writeOffBalance(input: WriteOffBalanceInput) {
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw badRequest('Write-off amount must be greater than zero');
  const reason = input.reason.trim();
  if (!reason) throw badRequest('A reason is required to write off a balance');

  const { data: order, error: orderErr } = await supabase
    .from('orders').select('store_id').eq('id', input.orderId).maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  if (!order) throw badRequest('Order not found', 404);

  const accounts = await resolveStoreAccounts(String((order as { store_id: string }).store_id));
  const journalDate = formatManilaDate(new Date());
  const peso = `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

  const { data, error } = await supabase.rpc('write_off_balance_atomic', {
    p_order_id: input.orderId,
    p_amount: amount,
    p_reason: reason,
    p_receivable_acct: accounts.receivableAccountId,
    p_income_acct: accounts.incomeAccountId,
    p_journal_tx_id: randomUUID(),
    p_journal_date: journalDate,
    p_journal_period: journalDate.slice(0, 7),
    p_note_id: randomUUID(),
    p_body: `Balance written off: ${peso}. Reason: ${reason}`,
    p_employee_id: input.employeeId,
  });
  if (error) throw new Error(`Failed to write off balance: ${error.message}`);
  const outcome = data as { success?: boolean; error?: string; balanceAfter?: number } | null;
  if (!outcome?.success) throw badRequest(outcome?.error ?? 'Failed to write off balance', 409);

  return { amount, balanceAfter: Number(outcome.balanceAfter ?? 0) };
}
