import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useBulkDriverPayment, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

interface Props {
  open: boolean;
  onClose: () => void;
  transfers: TransferRow[];
  storeId: string;
}

type Account = { id: string; name: string; accountType?: string; storeId?: string | null };

/** Driver payments should only ever debit the dedicated driver payments expense account. */
function isDriverExpenseAccount(a: Account): boolean {
  const n = a.name.toLowerCase();
  return n.includes('driver');
}

/**
 * Liquid accounts suitable as the cash-out source for a driver payment.
 * Excludes investment reserves, depreciation contra-accounts, and receivables.
 */
function isLiquidPaymentAccount(a: Account): boolean {
  const n = a.name.toLowerCase();
  const EXCLUDED = ['depreciation', 'vehicle fund', 'fleet', 'advance', 'charity', 'receivable', 'card payment'];
  if (EXCLUDED.some((kw) => n.includes(kw))) return false;
  return true;
}

/** Calculate the suggested driver cut for a single transfer, accounting for per_head pricing. */
function suggestedDriverCut(t: TransferRow): number {
  const cut = t.routeDriverCut ?? 0;
  if (t.routePricingType === 'per_head') return cut * t.paxCount;
  return cut;
}

export function BulkDriverPaymentModal({ open, onClose, transfers, storeId }: Props) {
  const mutation = useBulkDriverPayment();
  const { data: accounts = [] } = useChartOfAccounts();

  const accList = accounts as Account[];
  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company'),
    [accList, storeId],
  );

  // Only show transfer/driver expense accounts in the debit picker.
  const driverExpenseAccounts = useMemo(() => {
    const filtered = storeAccounts.filter(
      (a) => (a.accountType ?? '').toLowerCase() === 'expense' && isDriverExpenseAccount(a),
    );
    // Fall back to all expense accounts if no transfer-specific ones are configured yet.
    return filtered.length > 0
      ? filtered
      : storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'expense');
  }, [storeAccounts]);

  // Only show liquid cash/bank accounts in the credit picker.
  const liquidAccounts = useMemo(
    () => storeAccounts.filter(
      (a) => (a.accountType ?? '').toLowerCase() === 'asset' && isLiquidPaymentAccount(a),
    ),
    [storeAccounts],
  );

  // Per-transfer driver fee amounts (editable).
  const [fees, setFees] = useState<Record<string, string>>({});
  const [driverExpenseAccountId, setDriverExpenseAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  // Reset when the modal opens or the transfer list changes.
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const t of transfers) {
      const cut = suggestedDriverCut(t);
      initial[t.id] = cut > 0 ? String(cut) : '';
    }
    setFees(initial);
    // Auto-select the driver expense account if there's exactly one option.
    setDriverExpenseAccountId(driverExpenseAccounts.length === 1 ? driverExpenseAccounts[0].id : '');
    setCashAccountId('');
    setDate(new Date().toISOString().slice(0, 10));
    setError('');
  }, [open, transfers, driverExpenseAccounts]);

  const totalDriverPay = useMemo(
    () => transfers.reduce((sum, t) => sum + (parseFloat(fees[t.id] ?? '') || 0), 0),
    [fees, transfers],
  );

  const totalRevenue = useMemo(
    () => transfers.reduce((sum, t) => sum + moneyAmount(t.totalPrice), 0),
    [transfers],
  );

  const totalMarkup = totalRevenue - totalDriverPay;

  function setFee(id: string, value: string) {
    setFees((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const driverFees: Record<string, number> = {};
    for (const t of transfers) {
      const val = parseFloat(fees[t.id] ?? '');
      if (!val || val <= 0) {
        setError(`Enter a valid driver fee for ${t.customerName} (${t.serviceDate})`);
        return;
      }
      driverFees[t.id] = val;
    }

    if (!driverExpenseAccountId) { setError('Select a driver expense account'); return; }
    if (!cashAccountId) { setError('Select a payment account'); return; }

    try {
      await mutation.mutateAsync({
        transferIds: transfers.map((t) => t.id),
        driverFees,
        driverExpenseAccountId,
        cashAccountId,
        date,
        storeId,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record driver payment');
    }
  }

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title={`Pay Driver — ${transfers.length} Transfer${transfers.length !== 1 ? 's' : ''}`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Transfer breakdown table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-sand-brand text-xs text-charcoal-brand/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Route</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Pay to Driver</th>
                <th className="px-3 py-2 text-right font-medium">Lola's Markup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transfers.map((t) => {
                const revenue = moneyAmount(t.totalPrice);
                const feeVal = parseFloat(fees[t.id] ?? '') || 0;
                const rowMarkup = revenue - feeVal;
                return (
                  <tr key={t.id} className="hover:bg-sand-brand/50">
                    <td className="whitespace-nowrap px-3 py-2 text-charcoal-brand/70">
                      {formatDate(t.serviceDate)}
                    </td>
                    <td className="px-3 py-2 font-medium text-charcoal-brand">{t.customerName}</td>
                    <td className="px-3 py-2 text-charcoal-brand/70">{t.route}</td>
                    <td className="px-3 py-2 text-right font-medium text-charcoal-brand">
                      {formatCurrency(revenue)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fees[t.id] ?? ''}
                        onChange={(e) => setFee(t.id, e.target.value)}
                        required
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-medium">
                      {feeVal > 0 ? (
                        <span className={rowMarkup >= 0 ? 'text-green-700' : 'text-red-600'}>
                          {formatCurrency(rowMarkup)}
                        </span>
                      ) : (
                        <span className="text-charcoal-brand/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals summary */}
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-charcoal-brand/60">Total transfer revenue</span>
            <span className="font-medium text-charcoal-brand">{formatCurrency(totalRevenue)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-charcoal-brand/60">Total paid to driver</span>
            <span className="font-medium text-charcoal-brand">{formatCurrency(totalDriverPay)}</span>
          </div>
          <div className={`flex justify-between px-4 py-2.5 font-semibold ${totalMarkup >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <span className={totalMarkup >= 0 ? 'text-green-800' : 'text-red-800'}>Lola's markup</span>
            <span className={totalMarkup >= 0 ? 'text-green-800' : 'text-red-800'}>
              {formatCurrency(totalMarkup)}
            </span>
          </div>
        </div>

        {/* Date + accounts */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-charcoal-brand/60">Payment Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-charcoal-brand/60">Debit (Driver Expense)</span>
            <select
              value={driverExpenseAccountId}
              onChange={(e) => setDriverExpenseAccountId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            >
              <option value="">Select account…</option>
              {driverExpenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-charcoal-brand/60">Credit (Cash / GCash)</span>
            <select
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            >
              <option value="">Select account…</option>
              {liquidAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-xs text-charcoal-brand/50">
          One journal entry will be created: individual debit legs per transfer (driver expense) and a single cash credit of {formatCurrency(totalDriverPay)}.
        </p>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-charcoal-brand hover:bg-sand-brand disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || totalDriverPay <= 0}
            className="rounded-lg bg-teal-brand px-5 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
          >
            {mutation.isPending
              ? 'Recording…'
              : `Pay Driver ${formatCurrency(totalDriverPay)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
