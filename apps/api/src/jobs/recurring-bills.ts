import { supabase } from '../adapters/supabase/client.js';
import { getStoreDefaultCashAccount } from '../adapters/supabase/maintenance-expense-rpc.js';
import { randomUUID } from 'node:crypto';

export async function postRecurringBills(): Promise<void> {
  console.log('[recurring-bills] Checking for bills to post...');
  const today = new Date();
  const dayOfMonth = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const { data: bills, error } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('is_active', true)
    .eq('auto_post_to_ledger', true)
    .eq('day_of_month', dayOfMonth);

  if (error) { console.error('[recurring-bills]', error.message); return; }
  if (!bills || bills.length === 0) { console.log('[recurring-bills] No bills due today'); return; }

  const cashAccountCache = new Map<string, string | null>();

  for (const bill of bills) {
    const lastPosted = bill.last_posted_date ? new Date(bill.last_posted_date) : null;
    if (lastPosted && lastPosted.getMonth() + 1 === currentMonth && lastPosted.getFullYear() === currentYear) {
      console.log(`[recurring-bills] ${bill.bill_name} already posted this month`);
      continue;
    }

    let cashAccountId = cashAccountCache.get(bill.store_id);
    if (cashAccountId === undefined) {
      cashAccountId = await getStoreDefaultCashAccount(bill.store_id);
      cashAccountCache.set(bill.store_id, cashAccountId);
    }

    if (!cashAccountId) {
      console.error(`[recurring-bills] ${bill.bill_name}: no default cash account configured for store ${bill.store_id} — skipping`);
      continue;
    }

    const transactionId = randomUUID();
    const dateStr = today.toISOString().split('T')[0];
    const period = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const { error: jeError } = await supabase.from('journal_entries').insert([
      {
        id: randomUUID(), transaction_id: transactionId, period, date: dateStr,
        store_id: bill.store_id, account_id: bill.account_id,
        description: `Recurring bill: ${bill.bill_name}`,
        debit: bill.amount, credit: 0, reference_type: 'recurring_bill', reference_id: String(bill.id),
      },
      {
        id: randomUUID(), transaction_id: transactionId, period, date: dateStr,
        store_id: bill.store_id, account_id: cashAccountId,
        description: `Recurring bill: ${bill.bill_name}`,
        debit: 0, credit: bill.amount, reference_type: 'recurring_bill', reference_id: String(bill.id),
      },
    ]);

    if (jeError) { console.error(`[recurring-bills] ${bill.bill_name}:`, jeError.message); continue; }

    await supabase.from('recurring_bills').update({ last_posted_date: dateStr }).eq('id', bill.id);
    console.log(`[recurring-bills] Posted: ${bill.bill_name} (${bill.amount})`);
  }
}

if (process.env.RUN_RECURRING_BILLS === 'true') {
  postRecurringBills().catch(console.error);
}
