import type { LeaveBalancePort, LeaveBalance } from '@lolas/domain';
import { getSupabaseClient } from './client.js';

export class SupabaseLeaveBalanceAdapter implements LeaveBalancePort {
  async getBalance(employeeId: string): Promise<LeaveBalance> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('holiday_allowance, holiday_used, sick_allowance, sick_used')
      .eq('id', employeeId)
      .single();

    if (error) throw new Error(`getBalance failed: ${error.message}`);

    return {
      holidayAllowance: data.holiday_allowance ?? 0,
      holidayUsed: data.holiday_used ?? 0,
      sickAllowance: data.sick_allowance ?? 0,
      sickUsed: data.sick_used ?? 0,
    };
  }

  async deductLeave(
    employeeId: string,
    type: 'holiday' | 'sick',
    days: number,
  ): Promise<void> {
    const sb = getSupabaseClient();
    const balance = await this.getBalance(employeeId);
    const column = type === 'holiday' ? 'holiday_used' : 'sick_used';
    const current = type === 'holiday' ? balance.holidayUsed : balance.sickUsed;

    const { error } = await sb
      .from('employees')
      .update({ [column]: current + days })
      .eq('id', employeeId);

    if (error) throw new Error(`deductLeave failed: ${error.message}`);
  }

  async resetAnnualLeave(storeId: string): Promise<void> {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('employees')
      .update({ holiday_used: 0, sick_used: 0 })
      .eq('store_id', storeId)
      .eq('status', 'Active');

    if (error) throw new Error(`resetAnnualLeave failed: ${error.message}`);
  }
}

export function createLeaveBalanceAdapter(): LeaveBalancePort {
  return new SupabaseLeaveBalanceAdapter();
}
