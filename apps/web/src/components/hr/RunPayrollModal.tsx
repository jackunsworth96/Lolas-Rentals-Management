import { useState, useMemo, useEffect, Fragment } from 'react';
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
  /** Net pay from preview (before ad hoc bonus). Used to recalculate when bonus changes. */
  baseNetPay: number;
  netPay: number;
  paymentMethod: PaymentMethod;
  fromTill: number;
  fromSafe: number;
  bonus: number;
  cashAdvance: number;
  holidayAdjustment: number;
  // Full breakdown, carried through from the preview so operators can
  // review how each figure was derived before confirming the run.
  daysWorked: number;
  basicPay: number;
  overtimePay: number;
  ninePmBonus: number;
  tips: number;
  commission: number;
  bikeAllowance: number;
  grossPay: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(employeeId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

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
          baseNetPay: p.netPay,
          netPay: p.netPay,
          paymentMethod: method,
          fromTill: p.netPay,
          fromSafe: 0,
          bonus: 0,
          cashAdvance: p.cashAdvanceDeduction ?? 0,
          holidayAdjustment: p.holidayAdjustment ?? 0,
          daysWorked: p.daysWorked ?? 0,
          basicPay: p.basicPay ?? 0,
          overtimePay: p.overtimePay ?? 0,
          ninePmBonus: p.ninePmBonus ?? 0,
          tips: p.tips ?? 0,
          commission: p.commission ?? 0,
          bikeAllowance: p.bikeAllowance ?? 0,
          grossPay: p.grossPay ?? 0,
          sssDeduction: p.sssDeduction ?? 0,
          philhealthDeduction: p.philhealthDeduction ?? 0,
          pagibigDeduction: p.pagibigDeduction ?? 0,
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

        // When bonus changes, recalculate netPay and rebalance till/safe
        if (patch.bonus !== undefined) {
          updated.netPay = Math.round((updated.baseNetPay + Math.max(0, patch.bonus)) * 100) / 100;
          if (updated.paymentMethod === 'cash') {
            updated.fromTill = updated.netPay;
            updated.fromSafe = 0;
          }
        }
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
        // Recalculate fromTill when fromSafe changes
        if (patch.fromSafe !== undefined) {
          const safe = Math.min(Math.max(0, patch.fromSafe), updated.netPay);
          updated.fromSafe = safe;
          updated.fromTill = Math.round((updated.netPay - safe) * 100) / 100;
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

  /**
   * Flags rows that look wrong before they reach the confirm button:
   * - net pay with zero approved days worked (e.g. mis-attributed commission)
   * - commission that dwarfs basic pay for the same period (likely a rate/unit error)
   */
  function anomalyFor(row: PaymentRow): string | null {
    if (row.daysWorked === 0 && row.grossPay > 0.01) {
      return `No approved timesheets this period, but pay includes ${formatCurrency(row.grossPay)} — check commission attribution.`;
    }
    if (row.commission > 0 && row.basicPay > 0 && row.commission > row.basicPay * 3) {
      return `Commission (${formatCurrency(row.commission)}) is much larger than basic pay (${formatCurrency(row.basicPay)}) — check the commission rate.`;
    }
    return null;
  }

  const anomalyCount = paymentRows.filter((r) => anomalyFor(r) !== null).length;

  function handleRun() {
    const employeePayments: EmployeePaymentDetail[] = paymentRows.map((r) => ({
      employeeId: r.employeeId,
      paymentMethod: r.paymentMethod,
      fromTill: r.paymentMethod === 'cash' ? r.fromTill : undefined,
      fromSafe: r.paymentMethod === 'cash' ? r.fromSafe : undefined,
      bonuses: r.bonus > 0 ? r.bonus : undefined,
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

          {anomalyCount > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">
                {anomalyCount} row{anomalyCount !== 1 ? 's' : ''} flagged for review
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Expand a flagged row (▸) to see its full breakdown before confirming.
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Bonus</th>
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
                  const anomaly = anomalyFor(row);
                  const expanded = expandedIds.has(row.employeeId);
                  return (
                    <Fragment key={row.employeeId}>
                    <tr className={splitError ? 'bg-red-50' : anomaly ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(row.employeeId)}
                          className="text-gray-400 hover:text-gray-700"
                          aria-label={expanded ? 'Collapse breakdown' : 'Expand breakdown'}
                        >
                          {expanded ? '▾' : '▸'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{row.employeeName}</div>
                        {row.cashAdvance > 0 && (
                          <div className="text-xs text-red-600">
                            Cash advance deduction: {formatCurrency(row.cashAdvance)}
                          </div>
                        )}
                        {row.holidayAdjustment > 0 && (
                          <div className="text-xs text-teal-700">
                            Includes {formatCurrency(row.holidayAdjustment)} holiday/SIL adjustment
                          </div>
                        )}
                        {anomaly && (
                          <div className="mt-1 text-xs font-medium text-amber-700">⚠ {anomaly}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {row.daysWorked}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(row.grossPay)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-xs text-gray-400">₱</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.bonus || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateRow(row.employeeId, { bonus: parseFloat(e.target.value) || 0 })
                            }
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                        <div className="text-xs text-gray-400 text-right">Ad hoc payment</div>
                      </td>
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
                      <td className="px-3 py-2 text-right">
                        {isCash ? (
                          <input
                            type="number"
                            min={0}
                            max={row.netPay}
                            step={0.01}
                            value={row.fromSafe}
                            onChange={(e) =>
                              updateRow(row.employeeId, { fromSafe: parseFloat(e.target.value) || 0 })
                            }
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50">
                        <td />
                        <td colSpan={8} className="px-3 py-3">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Basic pay</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.basicPay)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Overtime</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.overtimePay)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">9PM bonus</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.ninePmBonus)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Tips</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.tips)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Commission</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.commission)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Bike allowance</span>
                              <span className="tabular-nums text-gray-800">{formatCurrency(row.bikeAllowance)}</span>
                            </div>
                            <div className="flex justify-between gap-2 border-t border-gray-200 pt-1 font-medium">
                              <span className="text-gray-600">Gross pay</span>
                              <span className="tabular-nums text-gray-900">{formatCurrency(row.grossPay)}</span>
                            </div>
                            <div />
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">SSS</span>
                              <span className="tabular-nums text-gray-800">−{formatCurrency(row.sssDeduction)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">PhilHealth</span>
                              <span className="tabular-nums text-gray-800">−{formatCurrency(row.philhealthDeduction)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Pag-IBIG</span>
                              <span className="tabular-nums text-gray-800">−{formatCurrency(row.pagibigDeduction)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-500">Cash advance</span>
                              <span className="tabular-nums text-gray-800">−{formatCurrency(row.cashAdvance)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 font-semibold text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                    {formatCurrency(paymentRows.reduce((s, r) => s + r.grossPay, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-700">
                    {formatCurrency(paymentRows.reduce((s, r) => s + r.bonus, 0))}
                  </td>
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
