import { randomUUID } from 'node:crypto';
import { DomainError, round2 } from '@lolas/domain';
import type { AllowanceAdjustmentInput, AllowanceWithdrawalInput } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger } from '../../adapters/supabase/config-repo.js';

type Row = Record<string, unknown>;

export interface AllowanceBalance {
  employeeId: string;
  employeeName: string;
  monthlyAllowance: number;
  balance: number;
  lastWithdrawal: string | null;
}

export interface AllowanceLedgerEntry {
  id: string;
  entryDate: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  expenseId: string | null;
  payrollRunId: string | null;
}

export async function listAllowanceBalances(storeId: string): Promise<AllowanceBalance[]> {
  const sb = getSupabaseClient();
  const { data: links, error: lErr } = await sb.from('employee_stores').select('employee_id').eq('store_id', storeId);
  if (lErr) throw new Error(`Failed to load store employees: ${lErr.message}`);
  const ids = [...new Set(((links ?? []) as Row[]).map((l) => String(l.employee_id)))];
  if (ids.length === 0) return [];
  const [empRes, ledRes] = await Promise.all([
    sb.from('employees').select('id, full_name, status, monthly_bike_allowance').in('id', ids),
    sb.from('employee_allowance_ledger').select('employee_id, entry_date, entry_type, amount').in('employee_id', ids),
  ]);
  if (empRes.error) throw new Error(`Failed to load employees: ${empRes.error.message}`);
  if (ledRes.error) throw new Error(`Failed to load allowance ledger: ${ledRes.error.message}`);
  const ledger = (ledRes.data ?? []) as Row[];
  return ((empRes.data ?? []) as Row[])
    .map((e) => {
      const rows = ledger.filter((l) => l.employee_id === e.id);
      const withdrawals = rows.filter((l) => l.entry_type === 'withdrawal').map((l) => String(l.entry_date)).sort();
      return {
        employeeId: String(e.id),
        employeeName: String(e.full_name ?? ''),
        monthlyAllowance: Number(e.monthly_bike_allowance ?? 0),
        balance: round2(rows.reduce((sum, l) => sum + Number(l.amount ?? 0), 0)),
        lastWithdrawal: withdrawals.at(-1) ?? null,
        active: e.status === 'Active',
      };
    })
    .filter((b) => b.active || b.balance !== 0)
    .map(({ active: _active, ...b }) => b)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function getAllowanceLedger(employeeId: string): Promise<AllowanceLedgerEntry[]> {
  const { data, error } = await getSupabaseClient()
    .from('employee_allowance_ledger')
    .select('id, entry_date, entry_type, amount, note, expense_id, payroll_run_id, created_at')
    .eq('employee_id', employeeId)
    .order('entry_date')
    .order('created_at');
  if (error) throw new Error(`Failed to load allowance ledger: ${error.message}`);
  let running = 0;
  return ((data ?? []) as Row[]).map((r) => {
    running = round2(running + Number(r.amount ?? 0));
    return {
      id: String(r.id),
      entryDate: String(r.entry_date),
      entryType: String(r.entry_type),
      amount: Number(r.amount ?? 0),
      balanceAfter: running,
      note: r.note == null ? null : String(r.note),
      expenseId: r.expense_id == null ? null : String(r.expense_id),
      payrollRunId: r.payroll_run_id == null ? null : String(r.payroll_run_id),
    };
  }).reverse();
}

async function employeeName(employeeId: string): Promise<string> {
  const { data } = await getSupabaseClient().from('employees').select('full_name').eq('id', employeeId).maybeSingle();
  if (!data) throw new DomainError('Employee not found');
  return String((data as Row).full_name ?? employeeId);
}

function rpcError(err: { message: string; code?: string }): Error {
  if (err.code === '23514') return new DomainError(err.message);
  return new Error(err.message);
}

/** Pays some of an employee's vehicle allowance balance out of the till (or another account). */
export async function withdrawAllowance(input: AllowanceWithdrawalInput, createdBy: string): Promise<{ expenseId: string }> {
  const ledger = await resolvePayrollLedger(input.storeId);
  const expenseId = randomUUID();
  const { error } = await getSupabaseClient().rpc('withdraw_vehicle_allowance', {
    p: {
      expenseId,
      employeeId: input.employeeId,
      employeeName: await employeeName(input.employeeId),
      storeId: input.storeId,
      date: input.date,
      amount: round2(input.amount),
      paidFrom: input.paidFromAccountId,
      payableAccountId: ledger.vehicleAllowancePayableId,
      note: input.note ?? '',
      createdBy,
      transactionId: randomUUID(),
      legIds: [randomUUID(), randomUUID()],
    },
  });
  if (error) throw rpcError(error);
  return { expenseId };
}

/** Sets an opening balance or corrects one; the allowance liability moves with it. */
export async function adjustAllowance(input: AllowanceAdjustmentInput, createdBy: string): Promise<void> {
  const ledger = await resolvePayrollLedger(input.storeId);
  const { error } = await getSupabaseClient().rpc('adjust_vehicle_allowance', {
    p: {
      employeeId: input.employeeId,
      employeeName: await employeeName(input.employeeId),
      storeId: input.storeId,
      date: input.date,
      amount: round2(input.amount),
      entryType: input.entryType,
      note: input.note,
      expenseAccountId: ledger.vehicleAllowanceExpenseId,
      payableAccountId: ledger.vehicleAllowancePayableId,
      createdBy,
      transactionId: randomUUID(),
      legIds: [randomUUID(), randomUUID()],
    },
  });
  if (error) throw rpcError(error);
}
