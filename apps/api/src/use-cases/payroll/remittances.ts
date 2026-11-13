import { randomUUID } from 'node:crypto';
import { DomainError, round2 } from '@lolas/domain';
import type { ContributionRemittanceInput } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { resolvePayrollLedger } from '../../adapters/supabase/config-repo.js';

type Row = Record<string, unknown>;
type Agency = 'sss' | 'philhealth' | 'pagibig';

const AGENCY_LABEL: Record<Agency, string> = { sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG' };

export interface RemittanceMonth {
  month: string;
  agency: Agency;
  employeeShare: number;
  employerShare: number;
  due: number;
  remitted: number;
  outstanding: number;
  employees: number;
}

export interface RemittanceRecord {
  id: string;
  agency: Agency;
  month: string;
  amount: number;
  fee: number;
  paidFromAccountId: string;
  paidFromName: string | null;
  paidDate: string;
  referenceNo: string | null;
  note: string | null;
  createdAt: string;
}

export interface RemittanceOverview {
  months: RemittanceMonth[];
  records: RemittanceRecord[];
  payableBalances: Record<Agency, number>;
}

/** What was withheld per month and agency (from posted payslips) against what has been paid to the agency. */
export async function getRemittanceOverview(year: number): Promise<RemittanceOverview> {
  const sb = getSupabaseClient();
  const [slipsRes, remRes, balRes] = await Promise.all([
    sb.from('payslips')
      .select('employee_id, pay_date, period_end, sss_deduction, philhealth_deduction, pagibig_deduction, employer_sss, employer_philhealth, employer_pagibig, payroll_runs!payroll_run_id(status)')
      .gte('period_end', `${year}-01-01`)
      .lte('period_end', `${year}-12-31`),
    sb.from('contribution_remittances')
      .select('*, chart_of_accounts!paid_from_account_id(name)')
      .like('contribution_month', `${year}-%`)
      .order('paid_date', { ascending: false }),
    sb.from('journal_entries')
      .select('account_id, debit, credit')
      .in('account_id', ['SSS-PAYABLE', 'PHILHEALTH-PAYABLE', 'PAGIBIG-PAYABLE']),
  ]);
  if (slipsRes.error) throw new Error(`Failed to load payslips: ${slipsRes.error.message}`);
  if (remRes.error) throw new Error(`Failed to load remittances: ${remRes.error.message}`);
  if (balRes.error) throw new Error(`Failed to load payable balances: ${balRes.error.message}`);

  const key = (m: string, a: Agency) => `${m}|${a}`;
  const map = new Map<string, RemittanceMonth & { ids: Set<string> }>();
  const get = (month: string, agency: Agency) => {
    const k = key(month, agency);
    let v = map.get(k);
    if (!v) {
      v = { month, agency, employeeShare: 0, employerShare: 0, due: 0, remitted: 0, outstanding: 0, employees: 0, ids: new Set() };
      map.set(k, v);
    }
    return v;
  };

  for (const r of (slipsRes.data ?? []) as Row[]) {
    const run = r.payroll_runs as { status: string } | Array<{ status: string }> | null;
    const status = Array.isArray(run) ? run[0]?.status : run?.status;
    if (status === 'voided') continue;
    const month = String(r.period_end).slice(0, 7);
    const pairs: Array<[Agency, number, number]> = [
      ['sss', Number(r.sss_deduction ?? 0), Number(r.employer_sss ?? 0)],
      ['philhealth', Number(r.philhealth_deduction ?? 0), Number(r.employer_philhealth ?? 0)],
      ['pagibig', Number(r.pagibig_deduction ?? 0), Number(r.employer_pagibig ?? 0)],
    ];
    for (const [agency, ee, er] of pairs) {
      if (ee === 0 && er === 0) continue;
      const m = get(month, agency);
      m.employeeShare += ee;
      m.employerShare += er;
      m.ids.add(String(r.employee_id));
    }
  }

  const records: RemittanceRecord[] = ((remRes.data ?? []) as Row[]).map((r) => {
    const acct = r.chart_of_accounts as { name: string } | Array<{ name: string }> | null;
    return {
      id: String(r.id),
      agency: r.agency as Agency,
      month: String(r.contribution_month),
      amount: Number(r.amount ?? 0),
      fee: Number(r.fee ?? 0),
      paidFromAccountId: String(r.paid_from_account_id),
      paidFromName: (Array.isArray(acct) ? acct[0]?.name : acct?.name) ?? null,
      paidDate: String(r.paid_date),
      referenceNo: r.reference_no == null ? null : String(r.reference_no),
      note: r.note == null ? null : String(r.note),
      createdAt: String(r.created_at),
    };
  });
  for (const rec of records) get(rec.month, rec.agency).remitted += rec.amount;

  const months = [...map.values()]
    .map(({ ids, ...m }) => {
      const due = round2(m.employeeShare + m.employerShare);
      return {
        ...m,
        employeeShare: round2(m.employeeShare),
        employerShare: round2(m.employerShare),
        due,
        remitted: round2(m.remitted),
        outstanding: round2(due - m.remitted),
        employees: ids.size,
      };
    })
    .sort((a, b) => (a.month === b.month ? a.agency.localeCompare(b.agency) : b.month.localeCompare(a.month)));

  const payableBalances: Record<Agency, number> = { sss: 0, philhealth: 0, pagibig: 0 };
  const accountAgency: Record<string, Agency> = { 'SSS-PAYABLE': 'sss', 'PHILHEALTH-PAYABLE': 'philhealth', 'PAGIBIG-PAYABLE': 'pagibig' };
  for (const j of (balRes.data ?? []) as Row[]) {
    const a = accountAgency[String(j.account_id)];
    if (a) payableBalances[a] = round2(payableBalances[a] + Number(j.credit ?? 0) - Number(j.debit ?? 0));
  }

  return { months, records, payableBalances };
}

/** Pays an agency: clears the payable, takes the money (and any fee) from the chosen account. */
export async function recordRemittance(input: ContributionRemittanceInput, createdBy: string): Promise<{ id: string }> {
  const ledger = await resolvePayrollLedger(input.storeId);
  const payable = { sss: ledger.sssPayableId, philhealth: ledger.philhealthPayableId, pagibig: ledger.pagibigPayableId }[input.agency];
  const amount = round2(input.amount);
  const fee = round2(input.fee ?? 0);
  if (input.paidFromAccountId === payable) throw new DomainError('Choose the account the money was paid from');
  const desc = `${AGENCY_LABEL[input.agency]} contributions ${input.month}${input.referenceNo ? ` (ref ${input.referenceNo})` : ''}`;
  const legs = [
    { id: randomUUID(), account_id: payable, debit: amount, credit: 0, description: desc },
    { id: randomUUID(), account_id: input.paidFromAccountId, debit: 0, credit: round2(amount + fee), description: desc },
  ];
  if (fee > 0) legs.push({ id: randomUUID(), account_id: ledger.transferFeeExpenseId, debit: fee, credit: 0, description: `${desc} fee` });

  const id = randomUUID();
  const { error } = await getSupabaseClient().rpc('record_contribution_remittance', {
    p: {
      id,
      agency: input.agency,
      month: input.month,
      amount,
      fee,
      paidFrom: input.paidFromAccountId,
      paidDate: input.paidDate,
      referenceNo: input.referenceNo ?? '',
      note: input.note ?? '',
      createdBy,
      transaction: {
        transactionId: randomUUID(),
        period: input.paidDate.slice(0, 7),
        date: input.paidDate,
        storeId: input.storeId,
        legs,
      },
    },
  });
  if (error) throw new Error(`Failed to record remittance: ${error.message}`);
  return { id };
}
