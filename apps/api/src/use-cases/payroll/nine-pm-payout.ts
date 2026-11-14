import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger } from '../../adapters/supabase/config-repo.js';
import { round2 } from '@lolas/domain';

export interface NinePmPayoutResult {
  timesheetId: string;
  amount: number;
}

/**
 * 9pm returns are now paid through payroll, so this NEVER creates a till
 * payout. It only keeps a payout that already exists (a paid expense,
 * DR wages / CR till, linked to the timesheet, from before the switch) in step
 * with edits: the amount is replaced, or the expense removed when the count
 * drops to zero. Payroll nets such a payout off the wages as already paid; a
 * timesheet with no payout is paid its 9pm earnings in full by payroll.
 */
export async function syncNinePmPayout(timesheetId: string, createdBy: string): Promise<NinePmPayoutResult> {
  const sb = getSupabaseClient();

  const { data: ts, error: tsErr } = await sb
    .from('timesheets')
    .select('id, date, employee_id, store_id, nine_pm_returns_count, payroll_status')
    .eq('id', timesheetId)
    .single();
  if (tsErr || !ts) throw new Error(`Timesheet ${timesheetId} not found`);

  const count = Number(ts.nine_pm_returns_count ?? 0);

  const { data: existing } = await sb.from('expenses').select('id').eq('timesheet_id', timesheetId).maybeSingle();
  // No payout from the till yet: leave it to payroll. Never create one here.
  if (!existing) return { timesheetId, amount: 0 };

  const [empRes, rateRes] = await Promise.all([
    sb.from('employees').select('full_name, nine_pm_bonus_rate').eq('id', ts.employee_id).single(),
    sb.from('employee_rate_history')
      .select('nine_pm_bonus_rate')
      .eq('employee_id', ts.employee_id)
      .lte('effective_from', ts.date)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (empRes.error || !empRes.data) throw new Error(`Employee ${ts.employee_id} not found`);

  const rate = Number(rateRes.data?.nine_pm_bonus_rate ?? empRes.data.nine_pm_bonus_rate ?? 0);
  const amount = round2(count * rate);
  const ledger = await resolvePayrollLedger(ts.store_id);

  const { error } = await sb.rpc('sync_nine_pm_payout', {
    p: {
      timesheetId,
      expenseId: randomUUID(),
      storeId: ts.store_id,
      date: ts.date,
      employeeId: ts.employee_id,
      employeeName: empRes.data.full_name,
      amount,
      count,
      paidFrom: ledger.cashAccountId,
      wagesAccountId: ledger.wagesAccountId,
      createdBy,
      transactionId: randomUUID(),
      legIds: [randomUUID(), randomUUID()],
    },
  });
  if (error) throw new Error(`Failed to record 9pm payout: ${error.message}`);

  return { timesheetId, amount };
}

/** Best effort for a batch: a failed payout leaves the 9pm pay to be settled through payroll instead. */
export async function syncNinePmPayouts(timesheetIds: string[], createdBy: string): Promise<{ paid: NinePmPayoutResult[]; failed: Array<{ timesheetId: string; error: string }> }> {
  const paid: NinePmPayoutResult[] = [];
  const failed: Array<{ timesheetId: string; error: string }> = [];
  for (const id of timesheetIds) {
    try {
      const r = await syncNinePmPayout(id, createdBy);
      if (r.amount > 0) paid.push(r);
    } catch (err) {
      failed.push({ timesheetId: id, error: (err as Error).message });
    }
  }
  return { paid, failed };
}
