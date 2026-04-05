import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import {
  usePreviewPayroll,
  useRunPayroll,
  type EmployeeRow,
  type EmployeePaymentDetail,
  type PayslipPreview,
  type RunPayrollResult,
} from '../../api/hr.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  employees: EmployeeRow[];
}

function todayMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function derivePeriod(yearMonth: string, half: 'first' | 'second'): { periodStart: string; periodEnd: string } {
  if (half === 'first') {
    return { periodStart: `${yearMonth}-01`, periodEnd: `${yearMonth}-15` };
  }
  const last = lastDayOfMonth(yearMonth);
  return { periodStart: `${yearMonth}-16`, periodEnd: `${yearMonth}-${String(last).padStart(2, '0')}` };
}

type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer';

interface PaymentRow {
  employeeId: string;
  employeeName: string;
  netPay: number;
  paymentMethod: PaymentMethod;
  fromTill: number;
  fromSafe: number;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
};

function isMonthlyRateType(rateType: string | null | undefined): boolean {
  return rateType?.toLowerCase() === 'monthly';
}

export function RunPayrollModal({ isOpen, onClose, storeId, employees }: Props) {
  const previewPayroll = usePreviewPayroll();
  const runPayroll = useRunPayroll();

  // Step 1: period config
  const [step, setStep] = useState<'config' | 'review' | 'done'>('config');
  const [periodHalf, setPeriodHalf] = useState<'first' | 'second'>('first');
  const [yearMonth, setYearMonth] = useState(todayMonthStr());
  const [workingDays, setWorkingDays] = useState(26);

  // Step 2: per-employee payment methods
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [result, setResult] = useState<RunPayrollResult | null>(null);

  const { periodStart, periodEnd } = derivePeriod(yearMonth, periodHalf);
  const isEndOfMonth = periodHalf === 'second';

  // Build a lookup of employee default payment methods
  const empMethodMap = useMemo(() => {
    const map = new Map<string, PaymentMethod>();
    for (const e of employees) {
      map.set(e.id, (e.defaultPaymentMethod as PaymentMethod) ?? 'cash');
    }
    return map;
  }, [employees]);

  function initPaymentRows(payslips: PayslipPreview[]) {
    const eligible = payslips.filter((p) => {
      const emp = employees.find((e) => e.id === p.employeeId);
      if (!emp) return true;
      return !isMonthlyRateType(emp.rateType);
    });
    setPaymentRows(
      eligible.map((p) => {
        const method = empMethodMap.get(p.employeeId) ?? 'cash';
        return {
          employeeId: p.employeeId,
          employeeName: p.employeeName,
          netPay: p.netPay,
          paymentMethod: method,
          fromTill: p.netPay,
          fromSafe: 0,
        };
      }),
    );
  }

  function handlePreview() {
    previewPayroll.mutate(
      { storeId, periodStart, periodEnd, isEndOfMonth, workingDaysInMonth: workingDays },
      {
        onSuccess: (data) => {
          initPaymentRows(data);
          setStep('review');
        },
      },
    );
  }

  function updateRow(employeeId: string, patch: Partial<PaymentRow>) {
    setPaymentRows((rows) =>
      rows.map((r) => {
        if (r.employeeId !== employeeId) return r;
        const updated = { ...r, ...patch };
        // Rebalance till/safe when method changes to cash
        if (patch.paymentMethod === 'cash') {
          updated.fromTill = updated.netPay;
          updated.fromSafe = 0;
        }
        // Recalculate fromSafe when fromTill changes
        if (patch.fromTill !== undefined) {
          const till = Math.min(Math.max(0, patch.fromTill), updated.netPay);
          updated.fromTill = till;
          updated.fromSafe = Math.round((updated.netPay - till) * 100) / 100;
        }
        return updated;
      }),
    );
  }

  // Validate: cash rows must have till + safe = netPay
  const isValid = paymentRows.every((r) => {
    if (r.paymentMethod === 'cash') {
      return Math.abs(r.fromTill + r.fromSafe - r.netPay) < 0.01;
    }
    return true;
  });

  function handleRun() {
    const employeePayments: EmployeePaymentDetail[] = paymentRows.map((r) => ({
      employeeId: r.employeeId,
      paymentMethod: r.paymentMethod,
      fromTill: r.paymentMethod === 'cash' ? r.fromTill : undefined,
      fromSafe: r.paymentMethod === 'cash' ? r.fromSafe : undefined,
    }));

    runPayroll.mutate(
      { storeId, periodStart, periodEnd, isEndOfMonth, workingDaysInMonth: workingDays, employeePayments },
      {
        onSuccess: (data) => {
          setResult(data);
          setStep('done');
        },
      },
    );
  }

  function handleClose() {
    setStep('config');
    setPaymentRows([]);
    setResult(null);
    previewPayroll.reset();
    runPayroll.reset();
    onClose();
  }

  // Reset when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setStep('config');
    setPaymentRows([]);
    setResult(null);
    previewPayroll.reset();
    runPayroll.reset();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={isOpen} onClose={handleClose} title="Run Payroll" size="lg">
      {step === 'done' && result ? (
        /* ── Step 3: result ── */
        <div className="space-y-4">
          <div className="rounded-lg bg-green-50 px-4 py-3">
            <p className="font-semibold text-green-800">
              Payroll complete — {result.employeeCount} employee{result.employeeCount !== 1 ? 's' : ''}
            </p>
            <p className="mt-1 text-sm text-green-700">
              Total Net: {formatCurrency(result.totalNetPay)} &nbsp;·&nbsp; Total Gross: {formatCurrency(result.totalGrossPay)}
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Employee</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gross</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.payslips.map((p) => (
                  <tr key={p.employeeId}>
                    <td className="px-3 py-2 text-gray-900">{p.employeeName}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(p.grossPay)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(p.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button type="button" onClick={handleClose} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
              Close
            </button>
          </div>
        </div>
      ) : step === 'review' ? (
        /* ── Step 2: per-employee payment methods ── */
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Period: <span className="font-medium text-gray-800">{periodStart} → {periodEnd}</span>
          </p>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Net Pay</th>
                  <th className="px-3 py-2 text-left">Payment method</th>
                  <th className="px-3 py-2 text-right">From till</th>
                  <th className="px-3 py-2 text-right">From safe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paymentRows.map((row) => {
                  const isCash = row.paymentMethod === 'cash';
                  const splitError = isCash && Math.abs(row.fromTill + row.fromSafe - row.netPay) >= 0.01;
                  return (
                    <tr key={row.employeeId} className={splitError ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-900">{row.employeeName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(row.netPay)}</td>
                      <td className="px-3 py-2">
                        <select
                          value={row.paymentMethod}
                          onChange={(e) =>
                            updateRow(row.employeeId, { paymentMethod: e.target.value as PaymentMethod })
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                            <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isCash ? (
                          <input
                            type="number"
                            min={0}
                            max={row.netPay}
                            step={0.01}
                            value={row.fromTill}
                            onChange={(e) =>
                              updateRow(row.employeeId, { fromTill: parseFloat(e.target.value) || 0 })
                            }
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {isCash ? formatCurrency(row.fromSafe) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-3 py-2 font-semibold text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                    {formatCurrency(paymentRows.reduce((s, r) => s + r.netPay, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            Monthly-rate employees are excluded from payroll runs and are paid via Owner Drawings.
          </p>

          {!isValid && (
            <p className="text-sm text-red-600">
              Till + safe amounts must equal net pay for cash employees.
            </p>
          )}
          {runPayroll.error && (
            <p className="text-sm text-red-600">{(runPayroll.error as Error).message}</p>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setStep('config')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={paymentRows.length === 0 || !isValid || runPayroll.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {runPayroll.isPending ? 'Running...' : 'Confirm & Run Payroll'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Step 1: period config ── */
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Pay period</p>
            <div className="flex gap-2">
              <input
                type="month"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setPeriodHalf('first')}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  periodHalf === 'first'
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                1st – 15th
              </button>
              <button
                type="button"
                onClick={() => setPeriodHalf('second')}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  periodHalf === 'second'
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                16th – End
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {periodStart} → {periodEnd}
            </p>
          </div>

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
          </label>

          {previewPayroll.error && (
            <p className="text-sm text-red-600">{(previewPayroll.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={handleClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewPayroll.isPending || !storeId || workingDays < 1}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {previewPayroll.isPending ? 'Calculating...' : 'Preview Payslips →'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
