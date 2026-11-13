import { useState } from 'react';
import { Modal } from '../../common/Modal.js';
import {
  useRemittances,
  useRecordRemittance,
  usePaymentAccounts,
  AGENCY_LABEL,
  type Agency,
  type RemittanceMonth,
} from '../../../api/payroll.js';
import { formatCurrency } from '../../../utils/currency.js';

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function RecordRemittanceModal({
  open,
  onClose,
  storeId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  initial: { agency: Agency; month: string; amount: number } | null;
}) {
  const { data: accounts = [] } = usePaymentAccounts(storeId);
  const record = useRecordRemittance();
  const [agency, setAgency] = useState<Agency>(initial?.agency ?? 'sss');
  const [month, setMonth] = useState(initial?.month ?? manilaToday().slice(0, 7));
  const [amount, setAmount] = useState<number | ''>(initial?.amount ?? '');
  const [fee, setFee] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [paidDate, setPaidDate] = useState(manilaToday());
  const [referenceNo, setReferenceNo] = useState('');

  const paidFrom = accountId || accounts.find((a) => a.method === 'bank_transfer')?.id || accounts[0]?.id || '';

  function close() {
    record.reset();
    onClose();
  }

  function submit() {
    if (!(Number(amount) > 0) || !paidFrom) return;
    record.mutate(
      {
        storeId,
        agency,
        month,
        amount: Number(amount),
        fee: Number(fee) || 0,
        paidFromAccountId: paidFrom,
        paidDate,
        referenceNo: referenceNo.trim() || undefined,
      },
      { onSuccess: close },
    );
  }

  return (
    <Modal open={open} onClose={close} title="Record contribution payment" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-600">Agency</span>
            <select value={agency} onChange={(e) => setAgency(e.target.value as Agency)} className={inputCls}>
              {(Object.keys(AGENCY_LABEL) as Agency[]).map((a) => <option key={a} value={a}>{AGENCY_LABEL[a]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">For month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Amount paid</span>
            <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Bank / transfer fee</span>
            <input type="number" min={0} step={0.01} value={fee} onChange={(e) => setFee(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Paid from</span>
            <select value={paidFrom} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-600">Date paid</span>
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-gray-600">Reference number (optional)</span>
          <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="PRN / receipt no." className={inputCls} />
        </label>
        {record.error && <p className="text-sm text-red-600">{(record.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!(Number(amount) > 0) || !paidFrom || record.isPending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {record.isPending ? 'Saving...' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function RemittancesTab({ storeId, canRecord }: { storeId: string; canRecord: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useRemittances(year);
  const [recordFor, setRecordFor] = useState<{ agency: Agency; month: string; amount: number } | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [showModal, setShowModal] = useState(false);

  function openRecord(initial: { agency: Agency; month: string; amount: number } | null) {
    setRecordFor(initial);
    setModalKey((k) => k + 1);
    setShowModal(true);
  }

  const months = data?.months ?? [];
  const byMonth = new Map<string, RemittanceMonth[]>();
  for (const m of months) byMonth.set(m.month, [...(byMonth.get(m.month) ?? []), m]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          What payroll withheld (employee share) plus the employer share, against what has been paid to each agency.
        </p>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canRecord && (
            <button type="button" onClick={() => openRecord(null)} disabled={!storeId || storeId === 'all'} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              Record payment
            </button>
          )}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(AGENCY_LABEL) as Agency[]).map((a) => (
            <div key={a} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">{AGENCY_LABEL[a]} owed</div>
              <div className={`text-sm font-semibold tabular-nums ${data.payableBalances[a] > 0.005 ? 'text-amber-700' : 'text-gray-900'}`}>
                {formatCurrency(data.payableBalances[a])}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Month</th>
              <th className="px-3 py-2 text-left">Agency</th>
              <th className="px-3 py-2 text-right">Staff</th>
              <th className="px-3 py-2 text-right">Employee share</th>
              <th className="px-3 py-2 text-right">Employer share</th>
              <th className="px-3 py-2 text-right">Due</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              {canRecord && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!isLoading && months.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No contributions withheld in {year} yet.</td></tr>
            )}
            {[...byMonth.entries()].map(([month, rows]) =>
              rows.map((m, i) => (
                <tr key={`${month}-${m.agency}`}>
                  <td className="px-3 py-2 text-gray-900">{i === 0 ? monthLabel(month) : ''}</td>
                  <td className="px-3 py-2 text-gray-700">{AGENCY_LABEL[m.agency]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.employees}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.employeeShare)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.employerShare)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(m.due)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-700">{formatCurrency(m.remitted)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${m.outstanding > 0.005 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {formatCurrency(m.outstanding)}
                  </td>
                  {canRecord && (
                    <td className="px-3 py-2 text-right">
                      {m.outstanding > 0.005 && storeId && storeId !== 'all' && (
                        <button type="button" onClick={() => openRecord({ agency: m.agency, month: m.month, amount: m.outstanding })} className="text-xs font-medium text-teal-700 hover:underline">
                          Pay
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      {(data?.records.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Payments made</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Paid</th>
                  <th className="px-3 py-2 text-left">Agency</th>
                  <th className="px-3 py-2 text-left">For</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2 text-left">From</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 tabular-nums">{r.paidDate}</td>
                    <td className="px-3 py-2">{AGENCY_LABEL[r.agency]}</td>
                    <td className="px-3 py-2">{monthLabel(r.month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.fee ? formatCurrency(r.fee) : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.paidFromName ?? r.paidFromAccountId}</td>
                    <td className="px-3 py-2 text-gray-600">{r.referenceNo ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RecordRemittanceModal key={modalKey} open={showModal} onClose={() => setShowModal(false)} storeId={storeId} initial={recordFor} />
    </div>
  );
}
