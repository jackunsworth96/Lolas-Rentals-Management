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
import { formatManilaDate } from '../../utils/manila-date.js';

function dateStr(d: Date | string): string {
  if (typeof d === 'string') return d;
  return formatManilaDate(d);
}

/** Adds `days` calendar days to a 'YYYY-MM-DD' string. Pure date-string arithmetic, no timezone conversion. */
function addDaysToDateStr(d: string, days: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10);
}

/**
 * Manila-day boundaries as UTC+8 ISO instants, for filtering timestamptz
 * columns (e.g. order_addons.added_at) against a date-only period. Using
 * bare 'YYYY-MM-DD' strings against a timestamptz column compares in UTC,
 * which silently drops Manila-afternoon/evening activity on the last day of
 * the period (UTC midnight is 8am Manila).
 */
function manilaDayBoundaries(start: string, end: string): { gte: string; lt: string } {
  return {
    gte: `${start}T00:00:00+08:00`,
    lt: `${addDaysToDateStr(end, 1)}T00:00:00+08:00`,
  };
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
      .from('payments')
      .select('amount')
      .eq('store_id', storeId)
      .eq('payment_type', 'tip')
      .gte('transaction_date', start)
      .lte('transaction_date', end);

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
    storeId: string,
    period: Period,
  ): Promise<CommissionSummary> {
    const sb = getSupabaseClient();
    const start = dateStr(period.start);
    const end = dateStr(period.end);
    const { gte, lt } = manilaDayBoundaries(start, end);

    // Per the business rule, this is intentionally a store-wide pool, not
    // per-sale attribution: every employee with a configured commission_rate
    // earns their own percentage of total Peace of Mind revenue for the
    // store that month, regardless of who sold which unit. order_addons has
    // no employee_id captured at all today (0 of 238 rows), so per-sale
    // attribution isn't possible yet even if the business model called for
    // it — scoping to store_id is what keeps a multi-store setup correct.
    const { data, error } = await sb
      .from('order_addons')
      .select('total_amount')
      .ilike('addon_name', '%peace of mind%')
      .eq('store_id', storeId)
      .gte('added_at', gte)
      .lt('added_at', lt);

    if (error) throw new Error(`aggregatePOMCommission failed: ${error.message}`);

    const totalOrderValue = (data ?? []).reduce(
      (sum: number, r: { total_amount: number }) => sum + (r.total_amount ?? 0),
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
      paydayType: (r.payday_type === 'mid_month' ? 'mid_month' : 'end_of_month') as 'mid_month' | 'end_of_month',
    }));
  }
}

export function createPayrollAdapter(): PayrollPort {
  return new SupabasePayrollAdapter();
}
