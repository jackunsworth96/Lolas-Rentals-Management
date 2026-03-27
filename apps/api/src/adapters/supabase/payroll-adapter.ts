import type {
  PayrollPort,
  TipsSummary,
  CommissionSummary,
  BonusRecord,
  CashAdvanceSchedule,
  PayslipBreakdown,
  PayPeriod,
} from '@lolas/domain';
import type { Period } from '@lolas/domain';
import { getSupabaseClient } from './client.js';

function dateStr(d: Date | string): string {
  if (typeof d === 'string') return d;
  return d.toISOString().slice(0, 10);
}

/**
 * Supabase implementation of PayrollPort.
 *
 * aggregateTips, aggregatePOMCommission, findBonuses, and
 * findCashAdvanceSchedules query real tables. calculatePayslip is delegated
 * to the domain calculator (called from the use-case layer), so its
 * implementation here throws — it should never be called directly on the port.
 *
 * NOTE: Tips and POM commission aggregation depend on order data structures
 * that may need adjustment once the full payroll UI is built. The queries
 * below are best-effort based on current table schemas.
 */
export class SupabasePayrollAdapter implements PayrollPort {
  async calculatePayslip(_params: PayPeriod): Promise<PayslipBreakdown> {
    throw new Error(
      'calculatePayslip should not be called on the adapter — use the domain calculator via the use-case layer',
    );
  }

  async aggregateTips(
    storeId: string,
    period: Period,
  ): Promise<TipsSummary> {
    const sb = getSupabaseClient();
    const start = dateStr(period.start);
    const end = dateStr(period.end);

    const { data, error } = await sb
      .from('order_payments')
      .select('amount')
      .eq('store_id', storeId)
      .eq('payment_type', 'tip')
      .gte('date', start)
      .lte('date', end);

    if (error) throw new Error(`aggregateTips failed: ${error.message}`);

    const rows = data ?? [];
    const totalTips = rows.reduce(
      (sum: number, r: { amount: number }) => sum + (r.amount ?? 0),
      0,
    );

    const { data: activeEmps, error: empError } = await sb
      .from('employees')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'Active');

    if (empError) throw new Error(`aggregateTips employees: ${empError.message}`);

    const employeeCount = activeEmps?.length ?? 1;

    return {
      storeId,
      period: `${start}_${end}`,
      totalTips,
      employeeCount,
      perEmployeeShare: employeeCount > 0 ? Math.round((totalTips / employeeCount) * 100) / 100 : 0,
    };
  }

  async aggregatePOMCommission(
    employeeId: string,
    period: Period,
  ): Promise<CommissionSummary> {
    const sb = getSupabaseClient();
    const start = dateStr(period.start);
    const end = dateStr(period.end);

    const { data, error } = await sb
      .from('order_addons')
      .select('price')
      .ilike('addon_name', '%peace of mind%')
      .gte('created_at', start)
      .lte('created_at', end);

    if (error) throw new Error(`aggregatePOMCommission failed: ${error.message}`);

    const totalOrderValue = (data ?? []).reduce(
      (sum: number, r: { price: number }) => sum + (r.price ?? 0),
      0,
    );

    const { data: emp } = await sb
      .from('employees')
      .select('commission_rate')
      .eq('id', employeeId)
      .single();

    const commissionRate = emp?.commission_rate ?? 0;

    return {
      employeeId,
      period: `${start}_${end}`,
      totalOrderValue,
      commissionRate,
      commissionAmount: Math.round(totalOrderValue * commissionRate * 100) / 100,
    };
  }

  async findBonuses(
    employeeId: string,
    period: Period,
  ): Promise<BonusRecord[]> {
    const sb = getSupabaseClient();
    const start = dateStr(period.start);
    const end = dateStr(period.end);

    const { data, error } = await sb
      .from('expenses')
      .select('id, employee_id, amount, description, date')
      .eq('employee_id', employeeId)
      .ilike('category', '%bonus%')
      .gte('date', start)
      .lte('date', end);

    if (error) throw new Error(`findBonuses failed: ${error.message}`);

    return (data ?? []).map((r: { id: string; employee_id: string; amount: number; description: string; date: string }) => ({
      id: r.id,
      employeeId: r.employee_id,
      amount: r.amount ?? 0,
      reason: r.description ?? '',
      date: r.date,
    }));
  }

  async findCashAdvanceSchedules(
    employeeId: string,
  ): Promise<CashAdvanceSchedule[]> {
    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('cash_advance_schedules')
      .select('*')
      .eq('employee_id', employeeId)
      .gt('remaining_balance', 0);

    if (error) throw new Error(`findCashAdvanceSchedules failed: ${error.message}`);

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      employeeId: String(r.employee_id),
      totalAmount: Number(r.total_amount ?? 0),
      deductionPerPeriod: Number(r.deduction_per_period ?? 0),
      remainingBalance: Number(r.remaining_balance ?? 0),
      startDate: String(r.start_date ?? ''),
    }));
  }
}

export function createPayrollAdapter(): PayrollPort {
  return new SupabasePayrollAdapter();
}
