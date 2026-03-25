import { supabase } from '../adapters/supabase/client.js';

export async function resetAnnualLeave(): Promise<void> {
  console.log('[leave-reset] Checking for annual leave resets...');
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  const { data: configs, error } = await supabase
    .from('leave_config')
    .select('*')
    .eq('reset_month', currentMonth)
    .eq('reset_day', currentDay);

  if (error) { console.error('[leave-reset]', error.message); return; }
  if (!configs || configs.length === 0) { console.log('[leave-reset] No resets due today'); return; }

  for (const config of configs) {
    const { error: updateError, count } = await supabase
      .from('employees')
      .update({
        holiday_used: 0,
        sick_used: 0,
        holiday_allowance: config.default_holiday_allowance,
        sick_allowance: config.default_sick_allowance,
      })
      .eq('store_id', config.store_id)
      .eq('status', 'Active');

    if (updateError) {
      console.error(`[leave-reset] Store ${config.store_id}:`, updateError.message);
    } else {
      console.log(`[leave-reset] Store ${config.store_id}: Reset ${count ?? 0} employees`);
    }
  }
}

if (process.env.RUN_LEAVE_RESET === 'true') {
  resetAnnualLeave().catch(console.error);
}
