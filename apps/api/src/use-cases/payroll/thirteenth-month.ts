import { randomUUID } from 'node:crypto';
import {
  buildThirteenthMonthPayoutJournal,
  DomainError,
  round2,
  type EmployeeRepository,
} from '@lolas/domain';
import type { ThirteenthMonthRunRequest, PayrollPaymentLine } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger } from '../../adapters/supabase/config-repo.js';
import { loadPaymentAccounts } from './payroll-engine.js';

type Row = Record<string, unknown>;

export interface ThirteenthMonthRow {
  employeeId: string;
  employeeName: string;
  status: string;
  /** 13th month accrued on regular payslips this year. */
  accruedYtd: number;
  /** Basic pay + paid leave earned this year (the statutory base). */
  basicEarnedYtd: number;
  /** Already paid out in a 13th month run this year. */
  paidYtd: number;
  /** Balance currently held in the 13th month payable for this employee. */
  balance: number;
  /** Straight-line estimate of the full-year amount. */
  projectedFullYear: number;
  monthsWithPay: number;
}

export interface ThirteenthMonthOverview {
  year: number;
  rows: ThirteenthMonthRow[];
  totals: { accruedYtd: number; paidYtd: number; balance: number; projectedFullYear: number };
  payableBalance: number;
  alreadyRun: boolean;
}

export async function getThirteenthMonthOverview(
  storeId: string,
  year: number,
  deps: { employees: EmployeeRepository },
): Promise<ThirteenthMonthOverview> {
  const sb = getSupabaseClient();
  const [slipsRes, balRes, runRes] = await Promise.all([
    sb.from('payslips')
      .select('employee_id, employee_name, run_type, period_end, basic_pay, leave_pay, thirteenth_month_accrual, thirteenth_month_pay, gross_pay, payroll_runs!payroll_run_id(status)')
      .eq('store_id', storeId)
      .gte('period_end', `${year}-01-01`)
      .lte('period_end', `${year}-12-31`),
    sb.from('journal_entries').select('debit, credit').eq('account_id', 'THIRTEENTH-MONTH-PAYABLE'),
    sb.from('payroll_runs').select('id').eq('store_id', storeId).eq('run_type', 'thirteenth_month')
      .eq('status', 'posted').eq('period_start', `${year}-01-01`).eq('period_end', `${year}-12-31`).maybeSingle(),
  ]);
  if (slipsRes.error) throw new Error(`Failed to load payslips: ${slipsRes.error.message}`);
  if (balRes.error) throw new Error(`Failed to load 13th month payable: ${balRes.error.message}`);

  const active = await deps.employees.findActive(storeId);
  const byId = new Map<string, ThirteenthMonthRow & { months: Set<string> }>();
  const ensure = (id: string, name: string, status: string, balance: number) => {
    let r = byId.get(id);
    if (!r) {
      r = { employeeId: id, employeeName: name, status, accruedYtd: 0, basicEarnedYtd: 0, paidYtd: 0, balance, projectedFullYear: 0, monthsWithPay: 0, months: new Set() };
      byId.set(id, r);
    }
    return r;
  };
  for (const e of active) ensure(e.id, e.fullName, e.status, e.thirteenthMonthAccrued);

  for (const s of (slipsRes.data ?? []) as Row[]) {
    const run = s.payroll_runs as { status: string } | Array<{ status: string }> | null;
    if ((Array.isArray(run) ? run[0]?.status : run?.status) === 'voided') continue;
    const r = ensure(String(s.employee_id), String(s.employee_name ?? ''), 'Inactive', 0);
    if (s.run_type === 'thirteenth_month') {
      r.paidYtd += Number(s.gross_pay ?? 0);
    } else {
      r.accruedYtd += Number(s.thirteenth_month_accrual ?? 0);
      r.basicEarnedYtd += Number(s.basic_pay ?? 0) + Number(s.leave_pay ?? 0);
      r.months.add(String(s.period_end).slice(0, 7));
    }
  }

  const missing = [...byId.values()].filter((r) => r.status === 'Inactive' && r.balance === 0).map((r) => r.employeeId);
  if (missing.length > 0) {
    const { data } = await sb.from('employees').select('id, status, thirteenth_month_accrued').in('id', missing);
    for (const e of (data ?? []) as Row[]) {
      const r = byId.get(String(e.id));
      if (r) {
        r.status = String(e.status ?? 'Inactive');
        r.balance = Number(e.thirteenth_month_accrued ?? 0);
      }
    }
  }

  const rows = [...byId.values()].map(({ months, ...r }) => {
    const monthsWithPay = months.size;
    const projected = monthsWithPay > 0 ? (r.accruedYtd / monthsWithPay) * 12 : 0;
    return {
      ...r,
      accruedYtd: round2(r.accruedYtd),
      basicEarnedYtd: round2(r.basicEarnedYtd),
      paidYtd: round2(r.paidYtd),
      balance: round2(r.balance),
      projectedFullYear: round2(projected),
      monthsWithPay,
    };
  }).filter((r) => r.status === 'Active' || r.accruedYtd > 0 || r.balance !== 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const sum = (f: (r: ThirteenthMonthRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return {
    year,
    rows,
    totals: {
      accruedYtd: sum((r) => r.accruedYtd),
      paidYtd: sum((r) => r.paidYtd),
      balance: sum((r) => r.balance),
      projectedFullYear: sum((r) => r.projectedFullYear),
    },
    payableBalance: round2(((balRes.data ?? []) as Row[]).reduce((s, j) => s + Number(j.credit ?? 0) - Number(j.debit ?? 0), 0)),
    alreadyRun: !!runRes.data,
  };
}

/** Pays out the 13th month (normally in December) as its own payroll run. */
export async function runThirteenthMonth(
  input: ThirteenthMonthRunRequest,
  runBy: string,
  deps: { employees: EmployeeRepository },
): Promise<{ runId: string; employeeCount: number; total: number }> {
  const ledger = await resolvePayrollLedger(input.storeId);
  const accounts = await loadPaymentAccounts(input.storeId);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const known = new Set(accounts.map((a) => a.id));
  const periodStart = `${input.year}-01-01`;
  const periodEnd = `${input.year}-12-31`;

  const lines = input.employees.filter((e) => e.amount > 0);
  if (lines.length === 0) throw new DomainError('Enter a 13th month amount for at least one employee');

  const transactions: unknown[] = [];
  const payslips: unknown[] = [];
  let total = 0;

  for (const line of lines) {
    const emp = await deps.employees.findById(line.employeeId);
    if (!emp) throw new DomainError(`Employee ${line.employeeId} not found`);
    const amount = round2(line.amount);
    let payments: PayrollPaymentLine[] = (line.payments ?? []).filter((p) => p.amount > 0);
    if (payments.length === 0) {
      const method = emp.defaultPaymentMethod;
      const acct = accounts.find((a) => a.method === method) ?? accounts.find((a) => a.id === ledger.cashAccountId);
      if (!acct) throw new DomainError('No payment account available');
      payments = [{ accountId: acct.id, method: acct.method, amount, fee: 0 }];
    }
    for (const p of payments) {
      if (!known.has(p.accountId)) throw new DomainError(`Unknown payment account ${p.accountId}`);
    }
    const accrued = Math.max(0, emp.thirteenthMonthAccrued);
    const desc = `13th month pay ${input.year} — ${emp.fullName}`;
    const legs = buildThirteenthMonthPayoutJournal(
      amount,
      payments.map((p) => ({ accountId: p.accountId, amount: p.amount, fee: p.fee ?? 0, label: accountName.get(p.accountId) ?? p.method })),
      ledger,
      accrued,
      desc,
    );
    const transactionId = randomUUID();
    transactions.push({
      transactionId,
      period: input.payDate.slice(0, 7),
      date: input.payDate,
      storeId: input.storeId,
      legs: legs.map((l) => ({
        id: randomUUID(),
        account_id: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        reference_type: 'payroll',
        reference_id: emp.id,
      })),
    });
    const fees = round2(payments.reduce((s, p) => s + (p.fee ?? 0), 0));
    payslips.push({
      employeeId: emp.id,
      employeeName: emp.fullName,
      isEndOfMonth: false,
      rateType: emp.rateType,
      grossPay: amount,
      netPay: amount,
      totalDeductions: 0,
      // Only the accrued part reduces the employee's 13th month balance.
      thirteenthMonthPay: round2(Math.min(accrued, amount)),
      transferFees: fees,
      journalTransactionId: transactionId,
      paidAs: emp.paidAs,
      paymentMethod: payments.length === 1 ? payments[0].method : 'split',
      payments,
      warnings: amount > accrued + 0.005 ? [`Includes ${(amount - accrued).toFixed(2)} above the accrued balance.`] : [],
    });
    total += amount;
  }

  const runId = randomUUID();
  const { error } = await getSupabaseClient().rpc('run_payroll_v2', {
    p_run: {
      id: runId,
      storeId: input.storeId,
      periodStart,
      periodEnd,
      payDate: input.payDate,
      runType: 'thirteenth_month',
      runBy,
      workingDaysInMonth: '',
      employeeCount: lines.length,
      totalGross: round2(total),
      totalNet: round2(total),
      totalEmployerContrib: 0,
      totalTransferFees: round2((payslips as Array<{ transferFees: number }>).reduce((s, p) => s + p.transferFees, 0)),
    },
    p_transactions: transactions,
    p_timesheet_ids: [],
    p_payslips: payslips,
  });
  if (error) throw Object.assign(new Error(`13th month run failed: ${error.message}`), { code: error.code });
  return { runId, employeeCount: lines.length, total: round2(total) };
}
