import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useChartOfAccounts } from '../../api/config.js';
import { useRunPayroll, type RunPayrollResult } from '../../api/hr.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
}

interface AccountConfig {
  id: string;
  name: string;
  type?: string;
  accountType?: string;
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

export function RunPayrollModal({ isOpen, onClose, storeId }: Props) {
  const { data: accounts = [] } = useChartOfAccounts();
  const runPayroll = useRunPayroll();

  const [periodHalf, setPeriodHalf] = useState<'first' | 'second'>('first');
  const [yearMonth, setYearMonth] = useState(todayMonthStr());
  const [workingDays, setWorkingDays] = useState(26);
  const [payrollExpenseAccountId, setPayrollExpenseAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [result, setResult] = useState<RunPayrollResult | null>(null);

  const accList = accounts as AccountConfig[];
  const accType = (a: AccountConfig) => (a.type ?? a.accountType ?? '').toLowerCase();
  const expenseAccounts = accList.filter((a) => accType(a) === 'expense');
  const assetAccounts = accList.filter((a) => accType(a) === 'asset');

  const { periodStart, periodEnd } = derivePeriod(yearMonth, periodHalf);
  const isEndOfMonth = periodHalf === 'second';

  const canSubmit =
    !runPayroll.isPending &&
    !!storeId &&
    !!payrollExpenseAccountId &&
    !!cashAccountId &&
    workingDays >= 1;

  function handleRun() {
    runPayroll.mutate(
      {
        storeId,
        periodStart,
        periodEnd,
        isEndOfMonth,
        workingDaysInMonth: workingDays,
        payrollExpenseAccountId,
        cashAccountId,
      },
      {
        onSuccess: (data) => setResult(data),
      },
    );
  }

  function handleClose() {
    setResult(null);
    runPayroll.reset();
    onClose();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="Run Payroll" size="lg">
      {result ? (
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
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Period selector */}
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

          {/* Working days */}
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

          {/* Payroll expense account */}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Payroll expense account</span>
            <select
              value={payrollExpenseAccountId}
              onChange={(e) => setPayrollExpenseAccountId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select account</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>

          {/* Cash / bank account */}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cash / bank account (paid from)</span>
            <select
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select account</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>

          {runPayroll.error && (
            <p className="text-sm text-red-600">{(runPayroll.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={!canSubmit}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {runPayroll.isPending ? 'Running...' : 'Run Payroll'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
