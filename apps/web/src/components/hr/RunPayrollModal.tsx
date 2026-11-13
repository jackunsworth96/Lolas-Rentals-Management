import { useState, useEffect, Fragment } from 'react';
import { Modal } from '../common/Modal.js';
import type { EmployeeRow } from '../../api/hr.js';
import {
  usePreviewPayroll,
  useRunPayroll,
  usePayrollRun,
  METHOD_LABEL,
  type PayrollPreview,
  type PayslipDraft,
  type PaymentLine,
  type PaymentAccountOption,
  type PostedPayrollRun,
  type PayrollPeriodRequest,
} from '../../api/payroll.js';
import { formatCurrency } from '../../utils/currency.js';
import { downloadPayslipsPdf } from '../../utils/payslipPdf.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  employees: EmployeeRow[];
  onViewRun?: (runId: string) => void;
}

const inputCls = 'rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500';

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function lastDayOfMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/** Mon–Sat days in the month: the divisor for monthly-rate staff. */
function defaultWorkingDays(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  let n = 0;
  for (let d = 1; d <= lastDayOfMonth(yearMonth); d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) n++;
  }
  return n;
}

function derivePeriod(yearMonth: string, half: 'first' | 'second') {
  if (half === 'first') return { periodStart: `${yearMonth}-01`, periodEnd: `${yearMonth}-15` };
  const last = String(lastDayOfMonth(yearMonth)).padStart(2, '0');
  return { periodStart: `${yearMonth}-16`, periodEnd: `${yearMonth}-${last}` };
}

function defaultHalf(): { yearMonth: string; half: 'first' | 'second' } {
  const today = manilaToday();
  const day = Number(today.slice(8, 10));
  return { yearMonth: today.slice(0, 7), half: day <= 20 ? 'first' : 'second' };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sumLines = (lines: PaymentLine[]) => r2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));

interface EmpState {
  bonus: number;
  bonusNote: string;
  payments: PaymentLine[];
}

export function RunPayrollModal({ isOpen, onClose, storeId, employees, onViewRun }: Props) {
  const previewMut = usePreviewPayroll();
  const runMut = useRunPayroll();

  const [step, setStep] = useState<'config' | 'review' | 'done'>('config');
  const init = defaultHalf();
  const [yearMonth, setYearMonth] = useState(init.yearMonth);
  const [half, setHalf] = useState<'first' | 'second'>(init.half);
  const [workingDays, setWorkingDays] = useState(defaultWorkingDays(init.yearMonth));
  const { periodStart, periodEnd } = derivePeriod(yearMonth, half);
  const [payDate, setPayDate] = useState(periodEnd);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [inputs, setInputs] = useState<Record<string, EmpState>>({});
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PostedPayrollRun | null>(null);
  const postedRun = usePayrollRun(result?.runId ?? null);

  const isEndOfMonth = half === 'second';

  useEffect(() => {
    if (!isOpen) return;
    const d = defaultHalf();
    setStep('config');
    setYearMonth(d.yearMonth);
    setHalf(d.half);
    setWorkingDays(defaultWorkingDays(d.yearMonth));
    setPayDate(derivePeriod(d.yearMonth, d.half).periodEnd);
    setExcluded(new Set());
    setPreview(null);
    setInputs({});
    setDirty(false);
    setResult(null);
    previewMut.reset();
    runMut.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function choosePeriod(ym: string, h: 'first' | 'second') {
    setYearMonth(ym);
    setHalf(h);
    setWorkingDays(defaultWorkingDays(ym));
    setPayDate(derivePeriod(ym, h).periodEnd);
  }

  function buildRequest(withPayments: boolean, excl = excluded): PayrollPeriodRequest {
    return {
      storeId,
      periodStart,
      periodEnd,
      payDate,
      isEndOfMonth,
      workingDaysInMonth: workingDays,
      excludeEmployeeIds: [...excl],
      employees: Object.entries(inputs)
        .filter(([id]) => !excl.has(id))
        .map(([employeeId, s]) => ({
          employeeId,
          bonuses: s.bonus || 0,
          bonusNote: s.bonusNote || undefined,
          payments: withPayments && s.payments.length > 0 ? s.payments : undefined,
        })),
    };
  }

  function applyPreview(data: PayrollPreview, keepPayments: boolean) {
    setPreview(data);
    setInputs((prev) => {
      const next: Record<string, EmpState> = {};
      for (const p of data.payslips) {
        const old = prev[p.employeeId];
        const keep = keepPayments && old && old.payments.length > 0 && Math.abs(sumLines(old.payments) - p.result.netPay) < 0.005;
        next[p.employeeId] = {
          bonus: old?.bonus ?? 0,
          bonusNote: old?.bonusNote ?? '',
          payments: keep ? old.payments : p.payments.map((x) => ({ ...x, fee: x.fee ?? 0 })),
        };
      }
      return next;
    });
    setDirty(false);
  }

  function handlePreview() {
    previewMut.mutate(buildRequest(false), {
      onSuccess: (data) => {
        applyPreview(data, false);
        setStep('review');
      },
    });
  }

  function recalculate(excl = excluded) {
    previewMut.mutate(buildRequest(true, excl), { onSuccess: (data) => applyPreview(data, true) });
  }

  function toggleExclude(id: string) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExcluded(next);
    recalculate(next);
  }

  function updateInput(id: string, patch: Partial<EmpState>) {
    setInputs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function updateLine(id: string, idx: number, patch: Partial<PaymentLine>) {
    const lines = [...(inputs[id]?.payments ?? [])];
    lines[idx] = { ...lines[idx], ...patch };
    updateInput(id, { payments: lines });
  }

  function addLine(id: string, net: number, accounts: PaymentAccountOption[]) {
    const lines = [...(inputs[id]?.payments ?? [])];
    const remaining = r2(net - sumLines(lines));
    const used = new Set(lines.map((l) => l.accountId));
    const acct = accounts.find((a) => !used.has(a.id)) ?? accounts[0];
    if (!acct) return;
    lines.push({ accountId: acct.id, method: acct.method, amount: Math.max(0, remaining), fee: 0 });
    updateInput(id, { payments: lines });
  }

  function removeLine(id: string, idx: number) {
    const lines = (inputs[id]?.payments ?? []).filter((_, i) => i !== idx);
    updateInput(id, { payments: lines });
  }

  function balanceFirstLine(id: string, net: number) {
    const lines = [...(inputs[id]?.payments ?? [])];
    if (lines.length === 0) return;
    const others = sumLines(lines.slice(1));
    lines[0] = { ...lines[0], amount: r2(Math.max(0, net - others)) };
    updateInput(id, { payments: lines });
  }

  function lineError(p: PayslipDraft): string | null {
    const lines = inputs[p.employeeId]?.payments ?? [];
    if (p.result.netPay <= 0) return null;
    const total = sumLines(lines);
    if (Math.abs(total - p.result.netPay) >= 0.005) {
      return `Payments total ${formatCurrency(total)} but net pay is ${formatCurrency(p.result.netPay)}.`;
    }
    return null;
  }

  function handleRun() {
    runMut.mutate(buildRequest(true), {
      onSuccess: (data) => {
        setResult(data);
        setStep('done');
      },
    });
  }

  const accounts = preview?.paymentAccounts ?? [];
  const payslips = preview?.payslips ?? [];
  const lineErrors = payslips.filter((p) => lineError(p) !== null).length;
  const blocking = preview?.blockingErrors ?? [];
  const canConfirm = !!preview && payslips.length > 0 && !dirty && lineErrors === 0 && blocking.length === 0 && !previewMut.isPending;
  const feesTotal = payslips.reduce((s, p) => s + (inputs[p.employeeId]?.payments ?? []).reduce((a, l) => a + (Number(l.fee) || 0), 0), 0);

  return (
    <Modal open={isOpen} onClose={onClose} title="Run Payroll" size="2xl">
      {step === 'done' && result ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 px-4 py-3">
            <p className="font-semibold text-green-800">
              Payroll posted for {result.employeeCount} employee{result.employeeCount !== 1 ? 's' : ''}
            </p>
            <p className="mt-1 text-sm text-green-700">
              Gross {formatCurrency(result.totalGross)} · Net {formatCurrency(result.totalNet)} · Pay date {payDate}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.payslips.map((p) => (
                  <tr key={p.employeeId}>
                    <td className="px-3 py-2 text-gray-900">{p.employeeName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(p.grossPay)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{formatCurrency(p.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              disabled={!postedRun.data}
              onClick={() => postedRun.data && downloadPayslipsPdf(postedRun.data.payslips, `${periodStart}-to-${periodEnd}`)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {postedRun.isLoading ? 'Preparing payslips...' : 'Download all payslips (PDF)'}
            </button>
            {onViewRun && (
              <button
                type="button"
                onClick={() => { onViewRun(result.runId); onClose(); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View run
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
              Close
            </button>
          </div>
        </div>
      ) : step === 'review' && preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <span>
              Period <span className="font-medium text-gray-900">{preview.periodStart} → {preview.periodEnd}</span>
              {' · '}Pay date <span className="font-medium text-gray-900">{preview.payDate}</span>
              {' · '}{isEndOfMonth ? 'End of month (contributions, commission, tips, allowance)' : 'Mid-month'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['Gross', preview.totals.gross],
              ['Net to pay', preview.totals.net],
              ['Employee contributions', preview.totals.employeeContrib],
              ['Employer contributions', preview.totals.employerContrib],
              ['Transfer fees', r2(feesTotal)],
            ].map(([label, v]) => (
              <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(Number(v))}</div>
              </div>
            ))}
          </div>

          {isEndOfMonth && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">
              Tips pool {formatCurrency(preview.tips.pool)} shared equally by {preview.tips.headcount} staff who worked this month
              ({formatCurrency(preview.tips.share)} each{preview.tips.remainder > 0 ? `, ${formatCurrency(preview.tips.remainder)} carried to next month` : ''}).
              {' '}Peace of Mind sales this month: {formatCurrency(preview.pomRevenue)}.
            </div>
          )}

          {blocking.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Fix these before posting:</p>
              <ul className="mt-1 list-disc pl-5">{blocking.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <p className="text-xs text-gray-500">
              Nothing to pay: {preview.skipped.map((s) => `${s.employeeName} (${s.reason})`).join(', ')}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Bonus</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Net pay</th>
                  <th className="px-3 py-2 text-left">Paid via</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payslips.map((p) => {
                  const r = p.result;
                  const st = inputs[p.employeeId] ?? { bonus: 0, bonusNote: '', payments: [] };
                  const err = lineError(p);
                  const isOpen = expanded.has(p.employeeId);
                  return (
                    <Fragment key={p.employeeId}>
                      <tr className={err ? 'bg-red-50' : r.warnings.length > 0 ? 'bg-amber-50' : ''}>
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => {
                              const n = new Set(prev);
                              if (n.has(p.employeeId)) n.delete(p.employeeId); else n.add(p.employeeId);
                              return n;
                            })}
                            className="text-gray-400 hover:text-gray-700"
                            aria-label={isOpen ? 'Collapse breakdown' : 'Expand breakdown'}
                          >
                            {isOpen ? '▾' : '▸'}
                          </button>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-gray-900">{p.employeeName}</div>
                          <div className="text-xs text-gray-500">{p.rateType === 'monthly' ? 'Monthly rate' : 'Daily rate'}</div>
                          {r.warnings.map((w) => <div key={w} className="mt-0.5 text-xs text-amber-700">⚠ {w}</div>)}
                          <button type="button" onClick={() => toggleExclude(p.employeeId)} className="mt-1 text-xs text-gray-500 hover:text-red-600 hover:underline">
                            Leave out of this run
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-gray-700">
                          {r.daysWorked}{r.leaveDays > 0 && <span className="text-xs text-gray-400"> +{r.leaveDays} leave</span>}
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-gray-700">{formatCurrency(r.grossPay)}</td>
                        <td className="px-3 py-2 text-right align-top">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={st.bonus || ''}
                            placeholder="0"
                            onChange={(e) => { updateInput(p.employeeId, { bonus: Math.max(0, Number(e.target.value) || 0) }); setDirty(true); }}
                            className={`${inputCls} w-20 text-right`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-gray-700">{formatCurrency(r.totalDeductions)}</td>
                        <td className="px-3 py-2 text-right align-top font-semibold tabular-nums text-gray-900">{formatCurrency(r.netPay)}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="space-y-1">
                            {st.payments.map((l, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-1">
                                <select
                                  value={l.accountId}
                                  onChange={(e) => {
                                    const a = accounts.find((x) => x.id === e.target.value);
                                    updateLine(p.employeeId, idx, { accountId: e.target.value, method: a?.method ?? 'other' });
                                  }}
                                  className={`${inputCls} max-w-[11rem]`}
                                >
                                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={l.amount}
                                  onChange={(e) => updateLine(p.employeeId, idx, { amount: Number(e.target.value) || 0 })}
                                  className={`${inputCls} w-24 text-right`}
                                  aria-label="Amount"
                                />
                                {l.method !== 'cash' && (
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={l.fee || ''}
                                    placeholder="fee"
                                    onChange={(e) => updateLine(p.employeeId, idx, { fee: Math.max(0, Number(e.target.value) || 0) })}
                                    className={`${inputCls} w-16 text-right`}
                                    aria-label="Transfer fee"
                                    title="Transfer fee paid by the business"
                                  />
                                )}
                                {st.payments.length > 1 && (
                                  <button type="button" onClick={() => removeLine(p.employeeId, idx)} className="px-1 text-gray-400 hover:text-red-600" aria-label="Remove payment line">×</button>
                                )}
                              </div>
                            ))}
                            {r.netPay > 0 && (
                              <div className="flex gap-3 text-xs">
                                <button type="button" onClick={() => addLine(p.employeeId, r.netPay, accounts)} className="text-teal-700 hover:underline">+ Split payment</button>
                                {err && <button type="button" onClick={() => balanceFirstLine(p.employeeId, r.netPay)} className="text-red-700 hover:underline">Balance first line</button>}
                              </div>
                            )}
                            {err && <div className="text-xs text-red-700">{err}</div>}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td />
                          <td colSpan={7} className="px-3 py-3">
                            <DraftBreakdown p={p} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {excluded.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>Left out:</span>
              {[...excluded].map((id) => (
                <button key={id} type="button" onClick={() => toggleExclude(id)} className="rounded-full border border-gray-300 px-2 py-0.5 hover:bg-gray-100">
                  {employees.find((e) => e.id === id)?.fullName ?? id} ↺
                </button>
              ))}
            </div>
          )}

          {dirty && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Bonuses changed. Recalculate to update net pay before posting.
              <button type="button" onClick={() => recalculate()} disabled={previewMut.isPending} className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {previewMut.isPending ? 'Recalculating...' : 'Recalculate'}
              </button>
            </div>
          )}

          {previewMut.error && <p className="text-sm text-red-600">{(previewMut.error as Error).message}</p>}
          {runMut.error && <p className="text-sm text-red-600">{(runMut.error as Error).message}</p>}

          <div className="flex justify-between border-t border-gray-200 pt-4">
            <button type="button" onClick={() => setStep('config')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Back
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={!canConfirm || runMut.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {runMut.isPending ? 'Posting...' : `Post payroll · ${formatCurrency(preview.totals.net)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Pay period</p>
            <div className="flex flex-wrap gap-2">
              <input type="month" value={yearMonth} onChange={(e) => choosePeriod(e.target.value, half)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              {(['first', 'second'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => choosePeriod(yearMonth, h)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    half === h ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {h === 'first' ? '1st – 15th (paid on the 15th)' : '16th – end (paid on the last day)'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{periodStart} → {periodEnd}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pay date</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <span className="mt-1 block text-xs text-gray-500">The journal is dated on this day.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Working days in month</span>
              <input
                type="number"
                min={1}
                max={31}
                value={workingDays}
                onChange={(e) => setWorkingDays(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">Monthly-rate staff earn their monthly rate ÷ this per day worked.</span>
            </label>
          </div>

          {isEndOfMonth && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              End-of-month run: SSS, PhilHealth and Pag-IBIG are deducted, Peace of Mind commission and the tips pool are paid,
              and each employee&apos;s monthly vehicle allowance is added to their balance.
            </p>
          )}

          {previewMut.error && <p className="text-sm text-red-600">{(previewMut.error as Error).message}</p>}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewMut.isPending || !storeId || storeId === 'all' || workingDays < 1}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {previewMut.isPending ? 'Calculating...' : 'Preview payslips →'}
            </button>
          </div>
          {storeId === 'all' && <p className="text-right text-xs text-amber-700">Pick a single store to run payroll.</p>}
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="tabular-nums text-gray-800">{negative ? '−' : ''}{formatCurrency(value)}</span>
    </div>
  );
}

function DraftBreakdown({ p }: { p: PayslipDraft }) {
  const r = p.result;
  return (
    <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
      <div className="space-y-1">
        <p className="font-semibold text-gray-700">Earnings</p>
        <Row label={`Basic (${r.daysWorked} days)`} value={r.basicPay} />
        <Row label={`Paid leave (${r.leaveDays} days)`} value={r.leavePay} />
        <Row label={`Overtime (${r.overtimeHours} h)`} value={r.overtimePay} />
        <Row label={`Holiday premium (${r.holidayDays} days)`} value={r.holidayPremium} />
        <Row label={`9pm returns (${r.ninePmCount})`} value={r.ninePmEarnings} />
        <Row label={`Commission (${p.commissionRate}% of ${formatCurrency(p.pomRevenue)})`} value={r.commission} />
        <Row label="Tips share" value={r.tips} />
        <Row label="Bonus" value={r.bonuses} />
        <div className="flex justify-between gap-2 border-t border-gray-200 pt-1 font-medium">
          <span>Gross</span><span className="tabular-nums">{formatCurrency(r.grossPay)}</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-gray-700">Deductions</p>
        <Row label="SSS" value={r.employeeContributions.sss} negative />
        <Row label="PhilHealth" value={r.employeeContributions.philhealth} negative />
        <Row label="Pag-IBIG" value={r.employeeContributions.pagibig} negative />
        <Row label="9pm already paid from till" value={r.ninePmPrepaid} negative />
        <Row label="Cash advance" value={r.cashAdvanceDeduction} negative />
        <div className="flex justify-between gap-2 border-t border-gray-200 pt-1 font-medium">
          <span>Net</span><span className="tabular-nums">{formatCurrency(r.netPay)}</span>
        </div>
        {(r.employerContributions.sss + r.employerContributions.philhealth + r.employerContributions.pagibig) > 0 && (
          <p className="pt-1 text-gray-500">
            Employer share: {formatCurrency(r.employerContributions.sss + r.employerContributions.philhealth + r.employerContributions.pagibig)}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-gray-700">Balances</p>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Vehicle allowance</span>
          <span className="tabular-nums text-gray-800">
            {formatCurrency(p.vehicleAllowance.opening)} → {formatCurrency(p.vehicleAllowance.closing)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Leave (holiday / sick)</span>
          <span className="tabular-nums text-gray-800">
            {p.leave.holidayBalance} / {p.leave.sickBalance} days{p.leave.onProbation ? ' · probation' : ''}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">13th month YTD</span>
          <span className="tabular-nums text-gray-800">{formatCurrency(p.thirteenthMonthYtd)}</span>
        </div>
        {p.dayLines.some((d) => d.premiumPct > 0) && (
          <div className="pt-1 text-gray-500">
            Premium days: {p.dayLines.filter((d) => d.premiumPct > 0).map((d) => `${d.date.slice(5)} +${d.premiumPct}%${d.holidayName ? ` (${d.holidayName})` : ''}`).join(', ')}
          </div>
        )}
        {p.rates.length > 1 && (
          <div className="pt-1 text-gray-500">
            Rate changed in period: {p.rates.map((x) => `${formatCurrency(x.basicRate)} from ${x.effectiveFrom}`).join(', ')}
          </div>
        )}
        {p.payments.length > 0 && (
          <div className="pt-1 text-gray-500">
            Default method: {METHOD_LABEL[p.payments[0].method] ?? p.payments[0].method}
          </div>
        )}
      </div>
    </div>
  );
}
