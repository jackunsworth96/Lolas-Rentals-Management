import { useMemo, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useSettleDriver, type TransferRow } from '../../api/transfers.js';
import { useChartOfAccounts } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { settlementStatement, shortRoute, transferCut } from './transfer-state.js';

interface Props {
  transfers: TransferRow[];
  storeId: string;
  storeName: string;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

const FIELD = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand';

export function DriverSettlementModal({ transfers, storeId, storeName, onClose, onSuccess }: Props) {
  const mutation = useSettleDriver();
  const { data: accounts = [] } = useChartOfAccounts();
  const routing = usePaymentRouting();

  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;
  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company'),
    [accList, storeId],
  );
  const assetAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');
  const expenseAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'expense');
  const defaultExpense =
    expenseAccounts.find((a) => a.id === `EXP-TRANSFER-FEE-${storeId}`)?.id
    ?? expenseAccounts.find((a) => a.id === 'EXP-DRIVER-PAY')?.id
    ?? '';

  const cuts = transfers.reduce((s, t) => s + transferCut(t), 0);
  const held = transfers.reduce((s, t) => s + t.driverCollectedAmount, 0);
  const net = Math.round((held - cuts) * 100) / 100;

  const [date, setDate] = useState(manilaToday());
  const [cashAccountId, setCashAccountId] = useState(() => routing.getCashAccount(storeId) ?? '');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [postJournal, setPostJournal] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const effectiveCash = cashAccountId || routing.getCashAccount(storeId) || '';
  const effectiveExpense = expenseAccountId || defaultExpense;

  async function copyStatement() {
    try {
      await navigator.clipboard.writeText(settlementStatement(transfers, storeName));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to the clipboard');
    }
  }

  async function handleSettle() {
    setError('');
    if (postJournal) {
      if (net !== 0 && !effectiveCash) { setError('Select the cash account the settlement goes through'); return; }
      if (cuts > 0 && !effectiveExpense) { setError('Select the driver expense account'); return; }
    }
    try {
      const result = await mutation.mutateAsync({
        storeId,
        transferIds: transfers.map((t) => t.id),
        date,
        cashAccountId: postJournal && net !== 0 ? effectiveCash : null,
        driverExpenseAccountId: postJournal ? effectiveExpense || null : null,
        postJournal,
      });
      onSuccess?.(`Settled ${result.count} transfer${result.count !== 1 ? 's' : ''} with the driver`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Settle with driver · ${transfers.length} transfer${transfers.length !== 1 ? 's' : ''}`}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void copyStatement()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? 'Copied' : 'Copy statement for driver'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSettle()}
              disabled={mutation.isPending}
              className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
            >
              {mutation.isPending ? 'Settling…' : 'Confirm settlement'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 tabular-nums">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Lola&apos;s owes driver</p>
            <p className="text-base font-semibold text-gray-900">{formatCurrency(cuts)}</p>
            <p className="text-xs text-gray-500">driver cuts</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Driver owes Lola&apos;s</p>
            <p className="text-base font-semibold text-gray-900">{formatCurrency(held)}</p>
            <p className="text-xs text-gray-500">fares they collected</p>
          </div>
          <div className="rounded-lg bg-teal-brand p-3 text-white">
            <p className="text-xs text-white/80">{net >= 0 ? 'Driver hands over' : "Lola's pays driver"}</p>
            <p className="text-base font-bold">{formatCurrency(Math.abs(net))}</p>
            <p className="text-xs text-white/80">net</p>
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Trip</th>
                <th className="px-3 py-2 text-right font-medium">Cut</th>
                <th className="px-3 py-2 text-right font-medium">Driver holds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="block truncate">{t.customerName}</span>
                    <span className="text-xs text-gray-500">{t.serviceDate}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{shortRoute(t.route)} · {t.paxCount} pax</td>
                  <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(transferCut(t))}</td>
                  <td className="px-3 py-2 text-right text-gray-900">
                    {t.driverCollectedAmount > 0 ? formatCurrency(t.driverCollectedAmount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!postJournal}
            onChange={(e) => setPostJournal(!e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-pretty">
            Already settled outside the system — mark as settled without posting to the accounts.
          </span>
        </label>

        {postJournal && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
            </label>
            {net !== 0 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{net > 0 ? 'Cash received into' : 'Paid from'}</span>
                <select value={effectiveCash} onChange={(e) => setCashAccountId(e.target.value)} className={FIELD}>
                  <option value="">Select account…</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}
            {cuts > 0 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Driver expense account</span>
                <select value={effectiveExpense} onChange={(e) => setExpenseAccountId(e.target.value)} className={FIELD}>
                  <option value="">Select account…</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
