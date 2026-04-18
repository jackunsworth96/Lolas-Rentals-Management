import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import {
  useMarkTransferCollected,
  moneyAmount,
  type TransferRow,
} from '../../api/transfers.js';
import { usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { Badge } from '../common/Badge.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';

interface Props {
  transfer: TransferRow | null;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

/** Manila-local YYYY-MM-DD. */
function todayManila(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

export function CollectTransferModal({ transfer, onClose, onSuccess }: Props) {
  const mutation = useMarkTransferCollected();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: accounts = [] } = useChartOfAccounts();

  const pmList = paymentMethods as Array<{ id: string; name: string }>;
  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;

  const storeId = transfer?.storeId ?? '';

  const assetAccounts = useMemo(() => {
    return accList
      .filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company')
      .filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');
  }, [accList, storeId]);

  /** Prefer the per-store transfer income account; fall back to the misc income account. */
  const resolvedIncomeAccountId = useMemo(() => {
    const transferIncome = accList.find((a) => a.id === `INCOME-TRANSFER-${storeId}`);
    if (transferIncome) return transferIncome.id;
    const misc = accList.find((a) => a.id === `MISC-INCOME-${storeId}`);
    return misc?.id ?? '';
  }, [accList, storeId]);

  const cashOrGcashMethods = useMemo(
    () =>
      pmList.filter((pm) => {
        const n = pm.name.toLowerCase();
        return n.includes('cash') || n.includes('gcash');
      }),
    [pmList],
  );

  const totalPrice = transfer ? moneyAmount(transfer.totalPrice) : 0;

  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [date, setDate] = useState(todayManila());
  const [error, setError] = useState('');

  const open = transfer !== null;

  useEffect(() => {
    if (open) {
      setPaymentMethodId('');
      setCashAccountId('');
      setDate(todayManila());
      setError('');
    }
  }, [open, transfer?.id]);

  const routing = usePaymentRouting();
  const routedCashAcct = routing.getReceivedInto(storeId, paymentMethodId);

  useEffect(() => {
    if (routedCashAcct && !cashAccountId) setCashAccountId(routedCashAcct);
  }, [routedCashAcct, cashAccountId]);

  if (!transfer) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!transfer) return;
    setError('');

    if (!paymentMethodId) {
      setError('Select a payment method');
      return;
    }
    if (!cashAccountId) {
      setError('Select the cash/GCash account that received the payment');
      return;
    }
    if (!resolvedIncomeAccountId) {
      setError('No transfer income account configured for this store');
      return;
    }
    if (!date) {
      setError('Select a date');
      return;
    }

    try {
      await mutation.mutateAsync({
        id: transfer.id,
        collectedAmount: totalPrice,
        paymentMethod: paymentMethodId,
        cashAccountId,
        transferIncomeAccountId: resolvedIncomeAccountId,
        date,
      });
      onSuccess?.('Transfer payment recorded');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record collection');
    }
  }

  return (
    <Modal open onClose={onClose} title="Collect Transfer Payment" size="lg">
      <div className="mb-4 rounded-xl border border-charcoal-brand/10 bg-sand-brand p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-lato font-semibold text-charcoal-brand">{transfer.customerName}</p>
            <p className="font-lato text-sm text-charcoal-brand/60">
              {transfer.route} · {transfer.serviceDate}
            </p>
          </div>
          <div className="text-right">
            <p className="font-lato text-lg font-bold text-charcoal-brand">
              {formatCurrency(totalPrice)}
            </p>
            <Badge
              color={
                transfer.paymentStatus === 'Paid'
                  ? 'green'
                  : transfer.paymentStatus === 'Partially Paid'
                  ? 'yellow'
                  : 'red'
              }
            >
              {transfer.paymentStatus}
            </Badge>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-lato text-xs font-medium text-charcoal-brand/70">Amount</span>
            <input
              type="text"
              readOnly
              value={formatCurrency(totalPrice)}
              className="mt-1 block w-full rounded-lg border border-charcoal-brand/20 bg-sand-brand/50 px-3 py-2 font-lato text-sm text-charcoal-brand"
            />
          </label>
          <label className="block">
            <span className="font-lato text-xs font-medium text-charcoal-brand/70">Date *</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-lato text-xs font-medium text-charcoal-brand/70">
              Payment Method *
            </span>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
            >
              <option value="">Select...</option>
              {cashOrGcashMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </label>

          {paymentMethodId && !routedCashAcct && (
            <label className="block">
              <span className="font-lato text-xs font-medium text-charcoal-brand/70">
                Cash Account *
              </span>
              <select
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-charcoal-brand/20 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
              >
                <option value="">Select...</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-lato text-xs text-amber-600">
                No routing rule configured — select manually
              </p>
            </label>
          )}
        </div>

        {error && <p className="font-lato text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-charcoal-brand/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-charcoal-brand/20 px-4 py-2 font-lato text-sm font-medium text-charcoal-brand hover:bg-sand-brand"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-teal-brand px-4 py-2 font-lato text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Recording...' : 'Record Collection'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
