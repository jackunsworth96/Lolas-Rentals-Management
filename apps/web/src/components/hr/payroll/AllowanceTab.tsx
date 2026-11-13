import { Fragment, useState } from 'react';
import { Modal } from '../../common/Modal.js';
import {
  useAllowanceBalances,
  useAllowanceLedger,
  useWithdrawAllowance,
  useAdjustAllowance,
  usePaymentAccounts,
  type AllowanceBalance,
} from '../../../api/payroll.js';
import { formatCurrency } from '../../../utils/currency.js';

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

const ENTRY_LABEL: Record<string, string> = {
  accrual: 'Monthly allowance added',
  withdrawal: 'Taken from the till',
  opening: 'Opening balance',
  adjustment: 'Adjustment',
  reversal: 'Payroll void reversal',
};

export function WithdrawAllowanceModal({
  open,
  onClose,
  storeId,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  employee: AllowanceBalance | null;
}) {
  const { data: accounts = [] } = usePaymentAccounts(storeId);
  const withdraw = useWithdrawAllowance();
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(manilaToday());
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');

  const tillId = accounts.find((a) => a.method === 'cash')?.id ?? '';
  const paidFrom = accountId || tillId;
  const over = employee != null && Number(amount) > employee.balance + 0.005;

  function close() {
    setAmount('');
    setNote('');
    setAccountId('');
    withdraw.reset();
    onClose();
  }

  function submit() {
    if (!employee || !paidFrom || !(Number(amount) > 0) || over) return;
    withdraw.mutate(
      { employeeId: employee.employeeId, storeId, date, amount: Number(amount), paidFromAccountId: paidFrom, note: note.trim() || undefined },
      { onSuccess: close },
    );
  }

  return (
    <Modal open={open} onClose={close} title="Pay vehicle allowance" size="md">
      {employee && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
            <span className="font-medium text-gray-900">{employee.employeeName}</span>
            <span className="ml-2 text-gray-600">Available {formatCurrency(employee.balance)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-gray-600">Amount</span>
              <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-gray-600">Paid from</span>
            <select value={paidFrom} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. fuel, tyre repair" className={inputCls} />
          </label>
          {over && <p className="text-sm text-red-600">That is more than the available balance.</p>}
          {withdraw.error && <p className="text-sm text-red-600">{(withdraw.error as Error).message}</p>}
          <p className="text-xs text-gray-500">Recorded as a paid expense, so it shows in Cash Up for the day.</p>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              onClick={submit}
              disabled={!(Number(amount) > 0) || over || !paidFrom || withdraw.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {withdraw.isPending ? 'Saving...' : `Pay ${formatCurrency(Number(amount) || 0)}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AdjustAllowanceModal({
  open,
  onClose,
  storeId,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  employee: AllowanceBalance | null;
}) {
  const adjust = useAdjustAllowance();
  const [entryType, setEntryType] = useState<'opening' | 'adjustment'>('opening');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(manilaToday());
  const [note, setNote] = useState('');

  function close() {
    setAmount('');
    setNote('');
    adjust.reset();
    onClose();
  }

  function submit() {
    if (!employee || !Number(amount) || !note.trim()) return;
    adjust.mutate(
      { employeeId: employee.employeeId, storeId, date, amount: Number(amount), entryType, note: note.trim() },
      { onSuccess: close },
    );
  }

  return (
    <Modal open={open} onClose={close} title="Adjust vehicle allowance" size="md">
      {employee && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
            <span className="font-medium text-gray-900">{employee.employeeName}</span>
            <span className="ml-2 text-gray-600">Current balance {formatCurrency(employee.balance)}</span>
          </div>
          <div className="flex gap-2">
            {(['opening', 'adjustment'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntryType(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${entryType === t ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                {t === 'opening' ? 'Opening balance' : 'Correction'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-gray-600">Amount {entryType === 'adjustment' && '(negative to reduce)'}</span>
              <input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-gray-600">Reason</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. unused allowance carried over from the old sheet" className={inputCls} />
          </label>
          {adjust.error && <p className="text-sm text-red-600">{(adjust.error as Error).message}</p>}
          <p className="text-xs text-gray-500">Moves the allowance liability with a matching staff vehicle allowance expense. No cash changes hands.</p>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              onClick={submit}
              disabled={!Number(amount) || !note.trim() || adjust.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {adjust.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function AllowanceLedger({ employeeId }: { employeeId: string }) {
  const { data: rows = [], isLoading } = useAllowanceLedger(employeeId);
  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-500">No allowance movements yet.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr>
          <th className="py-1 text-left">Date</th>
          <th className="py-1 text-left">Entry</th>
          <th className="py-1 text-right">Amount</th>
          <th className="py-1 text-right">Balance</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-1 tabular-nums">{r.entryDate}</td>
            <td className="py-1">{ENTRY_LABEL[r.entryType] ?? r.entryType}{r.note ? ` · ${r.note}` : ''}</td>
            <td className={`py-1 text-right tabular-nums ${r.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatCurrency(r.amount)}</td>
            <td className="py-1 text-right tabular-nums">{formatCurrency(r.balanceAfter)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AllowanceTab({ storeId, canPayOut, canAdjust }: { storeId: string; canPayOut: boolean; canAdjust: boolean }) {
  const { data: balances = [], isLoading } = useAllowanceBalances(storeId);
  const [withdrawFor, setWithdrawFor] = useState<AllowanceBalance | null>(null);
  const [adjustFor, setAdjustFor] = useState<AllowanceBalance | null>(null);
  const [openLedger, setOpenLedger] = useState<string | null>(null);

  const total = balances.reduce((s, b) => s + b.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Each employee&apos;s monthly allowance is added on the end-of-month payroll and rolls over until it is paid out from the till.
        </p>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          Owed to staff <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-right">Monthly</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-left">Last paid out</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && balances.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No employees with a vehicle allowance.</td></tr>
            )}
            {balances.map((b) => (
              <Fragment key={b.employeeId}>
                <tr>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setOpenLedger(openLedger === b.employeeId ? null : b.employeeId)} className="font-medium text-gray-900 hover:underline">
                      {openLedger === b.employeeId ? '▾' : '▸'} {b.employeeName}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatCurrency(b.monthlyAllowance)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(b.balance)}</td>
                  <td className="px-3 py-2 text-gray-600">{b.lastWithdrawal ?? '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canPayOut && (
                      <button
                        type="button"
                        disabled={b.balance <= 0}
                        onClick={() => setWithdrawFor(b)}
                        className="mr-2 rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
                      >
                        Pay out
                      </button>
                    )}
                    {canAdjust && (
                      <button type="button" onClick={() => setAdjustFor(b)} className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        Adjust
                      </button>
                    )}
                  </td>
                </tr>
                {openLedger === b.employeeId && (
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-6 py-3"><AllowanceLedger employeeId={b.employeeId} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <WithdrawAllowanceModal open={!!withdrawFor} onClose={() => setWithdrawFor(null)} storeId={storeId} employee={withdrawFor} />
      <AdjustAllowanceModal open={!!adjustFor} onClose={() => setAdjustFor(null)} storeId={storeId} employee={adjustFor} />
    </div>
  );
}
