import { supabase } from '../adapters/supabase/client.js';

/** Calendar date YYYY-MM-DD in Asia/Manila (business timezone). */
export function manilaDateString(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function manilaMonthDay(d = new Date()): { month: number; day: number } {
  const s = manilaDateString(d);
  const [, m, day] = s.split('-').map((x) => parseInt(x, 10));
  return { month: m, day };
}

/**
 * For each store whose leave_config reset_month / reset_day matches today (Manila),
 * set holiday_used and sick_used to 0 for active employees only.
 * Allowances are not changed. Idempotent per store per Manila calendar day via leave_reset_log.
 */
export async function resetAnnualLeave(): Promise<void> {
  console.log('[leave-reset] Checking for annual leave resets...');
  const { month: currentMonth, day: currentDay } = manilaMonthDay();
  const runDate = manilaDateString();

  const { data: configs, error } = await supabase
    .from('leave_config')
    .select('*')
    .eq('reset_month', currentMonth)
    .eq('reset_day', currentDay);

  if (error) {
    console.error('[leave-reset]', error.message);
    return;
  }
  if (!configs || configs.length === 0) {
    console.log('[leave-reset] No resets due today (Manila)');
    return;
  }

  for (const config of configs) {
    const storeId = config.store_id as string;

    const { data: claim, error: claimErr } = await supabase
      .from('leave_reset_log')
      .insert({
        store_id: storeId,
        run_date: runDate,
        employees_reset: 0,
      })
      .select('id')
      .maybeSingle();

    if (claimErr) {
      const dup = claimErr.code === '23505' || claimErr.message.toLowerCase().includes('duplicate');
      if (dup) {
        console.log(`[leave-reset] Skip store ${storeId}: already ran for ${runDate}`);
        continue;
      }
      console.error(`[leave-reset] Store ${storeId} claim insert:`, claimErr.message);
      continue;
    }
    if (!claim?.id) {
      console.log(`[leave-reset] Skip store ${storeId}: could not claim run slot`);
      continue;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('employees')
      .update({ holiday_used: 0, sick_used: 0 })
      .eq('store_id', storeId)
      .eq('status', 'Active')
      .select('id');

    if (updateError) {
      console.error(`[leave-reset] Store ${storeId} employee update:`, updateError.message);
      await supabase.from('leave_reset_log').delete().eq('id', claim.id);
      continue;
    }

    const count = updatedRows?.length ?? 0;
    const { error: logErr } = await supabase
      .from('leave_reset_log')
      .update({ employees_reset: count })
      .eq('id', claim.id);

    if (logErr) {
      console.error(`[leave-reset] Store ${storeId} log update:`, logErr.message);
    }

    console.log(
      `[leave-reset] Store ${storeId}: reset used leave for ${count} active employees (run_date=${runDate})`,
    );
  }
}

if (process.env.RUN_LEAVE_RESET === 'true') {
  resetAnnualLeave().catch(console.error);
}
