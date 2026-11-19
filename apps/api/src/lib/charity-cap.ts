import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

export const CHARITY_ANNUAL_CAP = 100000;
export const CHARITY_EXPENSE_ACCOUNT_ID = 'CHARITY-EXPENSE';

/**
 * Lola's own charity giving in the current Manila calendar year: direct
 * (off-ledger) donations plus charity expenses such as Paw Card matches.
 * Customer booking donations passed on to NGOs do not count toward the cap.
 */
export async function companyDonatedThisYear(sb: ReturnType<typeof getSupabaseClient>): Promise<number> {
  const yearStart = `${formatManilaDate().slice(0, 4)}-01-01`;
  const [offLedgerRes, expenseRes] = await Promise.all([
    sb.from('charity_offledger_donations').select('amount').gte('date', yearStart),
    sb
      .from('journal_entries')
      .select('debit, credit')
      .eq('account_id', CHARITY_EXPENSE_ACCOUNT_ID)
      .neq('reference_type', 'opening_balance')
      .gte('date', yearStart),
  ]);
  if (offLedgerRes.error) throw new Error(`Off-ledger charity donations failed: ${offLedgerRes.error.message}`);
  if (expenseRes.error) throw new Error(`Charity expense lookup failed: ${expenseRes.error.message}`);

  const offLedger = (offLedgerRes.data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
  const expenses = (expenseRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { debit: number | null }).debit ?? 0) - Number((r as { credit: number | null }).credit ?? 0),
    0,
  );
  return Math.round((offLedger + expenses) * 100) / 100;
}
