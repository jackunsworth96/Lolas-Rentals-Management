import type { Employee, EmployeeRepository } from '@lolas/domain';
import { Employee as EmployeeEntity } from '@lolas/domain';
import { getSupabaseClient } from './client.js';
import { parseDate } from './mappers.js';

interface EmployeeRow {
  id: string;
  store_id: string | null;
  full_name: string;
  role: string | null;
  status: string;
  basic_rate: number;
  overtime_rate: number;
  nine_pm_bonus_rate: number;
  commission_rate: number;
  paid_as: string | null;
  monthly_bike_allowance: number;
  bike_allowance_used: number;
  bike_allowance_accrued: number;
  available_balance: number;
  thirteenth_month_accrued: number;
  current_cash_advance: number;
  holiday_allowance: number;
  holiday_used: number;
  sick_allowance: number;
  sick_used: number;
  sss_deduction_amt: number;
  philhealth_deduction_amt: number;
  pagibig_deduction_amt: number;
  created_at: string;
  updated_at: string;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return EmployeeEntity.create({
    id: row.id,
    storeId: row.store_id,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    basicRate: row.basic_rate ?? 0,
    overtimeRate: row.overtime_rate ?? 0,
    ninePmBonusRate: row.nine_pm_bonus_rate ?? 0,
    commissionRate: row.commission_rate ?? 0,
    paidAs: row.paid_as,
    monthlyBikeAllowance: row.monthly_bike_allowance ?? 0,
    bikeAllowanceUsed: row.bike_allowance_used ?? 0,
    bikeAllowanceAccrued: row.bike_allowance_accrued ?? 0,
    availableBalance: row.available_balance ?? 0,
    thirteenthMonthAccrued: row.thirteenth_month_accrued ?? 0,
    currentCashAdvance: row.current_cash_advance ?? 0,
    holidayAllowance: row.holiday_allowance ?? 0,
    holidayUsed: row.holiday_used ?? 0,
    sickAllowance: row.sick_allowance ?? 0,
    sickUsed: row.sick_used ?? 0,
    sssDeductionAmt: row.sss_deduction_amt ?? 0,
    philhealthDeductionAmt: row.philhealth_deduction_amt ?? 0,
    pagibigDeductionAmt: row.pagibig_deduction_amt ?? 0,
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at),
  });
}

function employeeToRow(employee: Employee): Record<string, unknown> {
  return {
    id: employee.id,
    store_id: employee.storeId,
    full_name: employee.fullName,
    role: employee.role,
    status: employee.status,
    basic_rate: employee.basicRate,
    overtime_rate: employee.overtimeRate,
    nine_pm_bonus_rate: employee.ninePmBonusRate,
    commission_rate: employee.commissionRate,
    paid_as: employee.paidAs,
    monthly_bike_allowance: employee.monthlyBikeAllowance,
    bike_allowance_used: employee.bikeAllowanceUsed,
    bike_allowance_accrued: employee.bikeAllowanceAccrued,
    available_balance: employee.availableBalance,
    thirteenth_month_accrued: employee.thirteenthMonthAccrued,
    current_cash_advance: employee.currentCashAdvance,
    holiday_allowance: employee.holidayAllowance,
    holiday_used: employee.holidayUsed,
    sick_allowance: employee.sickAllowance,
    sick_used: employee.sickUsed,
    sss_deduction_amt: employee.sssDeductionAmt,
    philhealth_deduction_amt: employee.philhealthDeductionAmt,
    pagibig_deduction_amt: employee.pagibigDeductionAmt,
    updated_at: employee.updatedAt.toISOString(),
  };
}

export class SupabaseEmployeeRepository implements EmployeeRepository {
  async findById(id: string): Promise<Employee | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById failed: ${error.message}`);
    return data ? rowToEmployee(data as EmployeeRow) : null;
  }

  async findByStore(storeId: string): Promise<Employee[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .eq('store_id', storeId)
      .order('full_name');

    if (error) throw new Error(`findByStore failed: ${error.message}`);
    return (data as EmployeeRow[]).map(rowToEmployee);
  }

  async findActive(storeId: string): Promise<Employee[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'Active')
      .order('full_name');

    if (error) throw new Error(`findActive failed: ${error.message}`);
    return (data as EmployeeRow[]).map(rowToEmployee);
  }

  async save(employee: Employee): Promise<void> {
    const sb = getSupabaseClient();
    const row = employeeToRow(employee);
    const { error } = await sb.from('employees').upsert(row);

    if (error) throw new Error(`save failed: ${error.message}`);
  }
}
