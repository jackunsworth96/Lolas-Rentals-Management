import { useEffect, useState } from 'react';
import { Modal } from '../../common/Modal.js';
import {
  useThirteenthMonth,
  useRunThirteenthMonth,
  usePaymentAccounts,
  type ThirteenthMonthRow,
} from '../../../api/payroll.js';
import { formatCurrency } from '../../../utils/currency.js';

function decemberPayDate(year: number): string {
  return `${year}-12-15`;
}

function PayoutModal({
  open,
  onClose,
  storeId,
  year,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  year: number;
  rows: ThirteenthMonthRow[];
}) {
  const { data: accounts = [] } = usePaymentAccounts(storeId);
  const run = useRunThirteenthMonth();
  const [payDate, setPayDate] = useState(decemberPayDate(year));
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [accountFor, setAccountFor] = useState<Record<string, string>>({});
  const [fees, setFees] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setPayDate(decemberPayDate(year));
    setAmounts(Object.fromEntries(rows.map((r) => [r.employeeId, Math.max(0, r.balance)])));
    setAccountFor({});
    setFees({});
    run.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultAccount = accounts.find((a) => a.method === 'cash')?.id ?? accounts[0]?.id ?? '';
  const total = Object.values(amounts).reduce((s, v) => s + (v || 0), 0);

  function submit() {
    run.mutate(
      {
        storeId,
        year,
        payDate,
        employees: rows
          .filter((r) => (amounts[r.employeeId] ?? 0) > 0)
          .map((r) => {
            const acctId = accountFor[r.employeeId] || defaultAccount;
            const acct = accounts.find((a) => a.id === acctId);
            return {
              employeeId: r.employeeId,
              amount: amounts[r.employeeId],
              payments: acct
                ? [{ accountId: acct.id, method: acct.method, amount: amounts[r.employeeId], fee: fees[r.employeeId] || 0 }]
                : undefined,
            };
          }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pay 13th month ${year}`} size="xl">
      <div className="space-y-4">
        <label className="block w-48">
          <span className="text-sm text-gray-600">Pay date</span>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-right">Accrued</th>
                <th className="px-3 py-2 text-right">Pay now</th>
                <th className="px-3 py-2 text-left">Paid via</th>
                <th className="px-3 py-2 text-right">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const acctId = accountFor[r.employeeId] || defaultAccount;
                const method = accounts.find((a) => a.id === acctId)?.method;
                return (
                  <tr key={r.employeeId}>
                    <td className="px-3 py-2 text-gray-900">{r.employeeName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatCurrency(r.balance)}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={amounts[r.employeeId] ?? 0}
                        onChange={(e) => setAmounts({ ...amounts, [r.employeeId]: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={acctId}
                        onChange={(e) => setAccountFor({ ...accountFor, [r.employeeId]: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {method !== 'cash' && (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={fees[r.employeeId] || ''}
                          placeholder="0"
                          onChange={(e) => setFees({ ...fees, [r.employeeId]: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          Paying more than the accrued amount is allowed (for example rounding up); the extra is booked as 13th month expense.
        </p>
        {run.error && <p className="text-sm text-red-600">{(run.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={total <= 0 || run.isPending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {run.isPending ? 'Posting...' : `Pay ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ThirteenthMonthTab({ storeId, canRun }: { storeId: string; canRun: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useThirteenthMonth(storeId, year);
  const [showPayout, setShowPayout] = useState(false);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-600">
          Every payslip sets aside 1/12 of basic pay and paid leave, so the December payout is already in the books.
          The projection assumes the rest of the year continues at the same pace.
        </p>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canRun && (
            <button
              type="button"
              onClick={() => setShowPayout(true)}
              disabled={!storeId || storeId === 'all' || rows.length === 0}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Pay 13th month
            </button>
          )}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Accrued this year', data.totals.accruedYtd],
            ['Paid out', data.totals.paidYtd],
            ['Still to pay', data.totals.balance],
            ['Projected full year', data.totals.projectedFullYear],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
              <div className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(Number(v))}</div>
            </div>
          ))}
        </div>
      )}
      {data?.alreadyRun && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">The {year} 13th month has been paid. See the Runs tab for payslips.</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-right">Basic earned</th>
              <th className="px-3 py-2 text-right">Months paid</th>
              <th className="px-3 py-2 text-right">Accrued</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Projected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Nothing accrued in {year} yet. It builds up as payroll is run.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-3 py-2 text-gray-900">
                  {r.employeeName}
                  {r.status !== 'Active' && <span className="ml-2 text-xs text-gray-400">{r.status}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatCurrency(r.basicEarnedYtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.monthsWithPay}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.accruedYtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-green-700">{formatCurrency(r.paidYtd)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(r.balance)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatCurrency(r.projectedFullYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PayoutModal open={showPayout} onClose={() => setShowPayout(false)} storeId={storeId} year={year} rows={rows.filter((r) => r.balance > 0)} />
    </div>
  );
}
