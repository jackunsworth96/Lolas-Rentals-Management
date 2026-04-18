import type { Employee, EmployeeRepository } from '@lolas/domain';
import { Employee as EmployeeEntity } from '@lolas/domain';
import { getSupabaseClient } from './client.js';
import { parseDate } from './mappers.js';

interface EmployeeRow {
  id: string;
  store_id: string | null;
  employee_stores?: Array<{ store_id: string }> | null;
  full_name: string;
  role: string | null;
  status: string;
  birthday: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  start_date: string | null;
  probation_end_date: string | null;
  rate_type: string | null;
  basic_rate: number;
  overtime_rate: number;
  nine_pm_bonus_rate: number;
  commission_rate: number;
  paid_as: string | null;
  default_payment_method: string;
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
  sss_no: string | null;
  philhealth_no: string | null;
  pagibig_no: string | null;
  tin: string | null;
  sss_deduction_amt: number;
  philhealth_deduction_amt: number;
  pagibig_deduction_amt: number;
  created_at: string;
  updated_at: string;
}

function rowToEmployee(row: EmployeeRow): Employee {
  const storeIds = row.employee_stores?.map((r) => r.store_id) ?? (row.store_id ? [row.store_id] : []);
  return EmployeeEntity.create({
    id: row.id,
    storeId: storeIds[0] ?? row.store_id,
    storeIds,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    birthday: row.birthday ?? null,
    emergencyContactName: row.emergency_contact_name ?? null,
    emergencyContactNumber: row.emergency_contact_number ?? null,
    startDate: row.start_date ?? null,
    probationEndDate: row.probation_end_date ?? null,
    rateType: row.rate_type ?? null,
    basicRate: row.basic_rate ?? 0,
    overtimeRate: row.overtime_rate ?? 0,
    ninePmBonusRate: row.nine_pm_bonus_rate ?? 0,
    commissionRate: row.commission_rate ?? 0,
    paidAs: row.paid_as,
    defaultPaymentMethod: row.default_payment_method ?? 'cash',
    monthlyBikeAllowance: row.monthly_bike_allowance ?? 0,
    bikeAllowanceUsed: row.bike_allowance_used ?? 0,
    bikeAllowanceAccrued: row.bike_allowance_accrued ?? 0,
    availableBalance: row.available_balance ?? 0,
    thirteenthMonthAccrued: row.thirteenth_month_accrued ?? 0,
    currentCashAdvance: row.current_cash_advance ?? 0,
    sssNo: row.sss_no ?? null,
    philhealthNo: row.philhealth_no ?? null,
    pagibigNo: row.pagibig_no ?? null,
    tin: row.tin ?? null,
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
    birthday: employee.birthday,
    emergency_contact_name: employee.emergencyContactName,
    emergency_contact_number: employee.emergencyContactNumber,
    start_date: employee.startDate,
    probation_end_date: employee.probationEndDate,
    rate_type: employee.rateType,
    basic_rate: employee.basicRate,
    overtime_rate: employee.overtimeRate,
    nine_pm_bonus_rate: employee.ninePmBonusRate,
    commission_rate: employee.commissionRate,
    paid_as: employee.paidAs,
    default_payment_method: employee.defaultPaymentMethod,
    monthly_bike_allowance: employee.monthlyBikeAllowance,
    bike_allowance_used: employee.bikeAllowanceUsed,
    bike_allowance_accrued: employee.bikeAllowanceAccrued,
    available_balance: employee.availableBalance,
    thirteenth_month_accrued: employee.thirteenthMonthAccrued,
    current_cash_advance: employee.currentCashAdvance,
    sss_no: employee.sssNo,
    philhealth_no: employee.philhealthNo,
    pagibig_no: employee.pagibigNo,
    tin: employee.tin,
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
  async findAll(): Promise<Employee[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('*, employee_stores(store_id)')
      .order('full_name');

    if (error) throw new Error(`findAll failed: ${error.message}`);
    return (data as EmployeeRow[]).map(rowToEmployee);
  }

  async findById(id: string): Promise<Employee | null> {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('employees')
      .select('*, employee_stores(store_id)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById failed: ${error.message}`);
    return data ? rowToEmployee(data as EmployeeRow) : null;
  }

  async findByStore(storeId: string): Promise<Employee[]> {
    const sb = getSupabaseClient();
    const { data: esData, error: esError } = await sb
      .from('employee_stores')
      .select('employee_id')
      .eq('store_id', storeId);

    if (esError) throw new Error(`findByStore (employee_stores) failed: ${esError.message}`);

    const employeeIds = (esData ?? []).map((r) => r.employee_id as string);
    if (employeeIds.length === 0) return [];

    const { data, error } = await sb
      .from('employees')
      .select('*, employee_stores(store_id)')
      .in('id', employeeIds)
      .order('full_name');

    if (error) throw new Error(`findByStore failed: ${error.message}`);
    return (data as EmployeeRow[]).map(rowToEmployee);
  }

  async findActive(storeId: string): Promise<Employee[]> {
    const sb = getSupabaseClient();
    const { data: esData, error: esError } = await sb
      .from('employee_stores')
      .select('employee_id')
      .eq('store_id', storeId);

    if (esError) throw new Error(`findActive (employee_stores) failed: ${esError.message}`);

    const employeeIds = (esData ?? []).map((r) => r.employee_id as string);
    if (employeeIds.length === 0) return [];

    const { data, error } = await sb
      .from('employees')
      .select('*, employee_stores(store_id)')
      .in('id', employeeIds)
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
