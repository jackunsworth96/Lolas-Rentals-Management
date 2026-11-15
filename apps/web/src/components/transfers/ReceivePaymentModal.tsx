import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useReceiveTransferPayment, type TransferCollector, type TransferRow } from '../../api/transfers.js';
import { usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { shortRoute, transferCut, transferDue, transferTotal } from './transfer-state.js';

interface Props {
  transfer: TransferRow;
  initialCollector: TransferCollector;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

const FIELD = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand';

export function ReceivePaymentModal({ transfer, initialCollector, onClose, onSuccess }: Props) {
  const mutation = useReceiveTransferPayment();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: accounts = [] } = useChartOfAccounts();
  const routing = usePaymentRouting();

  const storeId = transfer.storeId;
  const due = transferDue(transfer);
  const cut = transferCut(transfer);

  const [collector, setCollector] = useState<TransferCollector>(initialCollector);
  const [amount, setAmount] = useState<number | ''>(due);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [date, setDate] = useState(manilaToday());
  const [error, setError] = useState('');

  const methods = useMemo(() => {
    const list = (paymentMethods as Array<{ id: string; name: string; isActive?: boolean }>)
      .filter((pm) => pm.isActive !== false && pm.id !== 'Driver Collected');
    return transfer.billedToOrder ? list : list.filter((pm) => !pm.name.toLowerCase().includes('card'));
  }, [paymentMethods, transfer.billedToOrder]);

  const assetAccounts = useMemo(
    () => (accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>)
      .filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company')
      .filter((a) => (a.accountType ?? '').toLowerCase() === 'asset'),
    [accounts, storeId],
  );

  const selectedMethod = methods.find((pm) => pm.id === paymentMethodId);
  const isCard = !!selectedMethod && selectedMethod.name.toLowerCase().includes('card');
  const routedAccount = paymentMethodId
    ? routing.resolveReceivedIntoForStore(storeId, paymentMethodId, selectedMethod?.name)
    : null;
  const accountId = routedAccount ?? cashAccountId;

  useEffect(() => {
    if (!paymentMethodId && methods.length > 0) {
      const cash = methods.find((pm) => pm.name.toLowerCase() === 'cash') ?? methods[0];
      setPaymentMethodId(cash.id);
    }
  }, [methods, paymentMethodId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    if (!value || value <= 0) { setError('Enter an amount greater than 0'); return; }
    if (value > due + 0.005) { setError(`That's more than the ${formatCurrency(due)} still owed`); return; }
    if (collector === 'lolas') {
      if (!paymentMethodId) { setError('Select how the customer paid'); return; }
      if (!isCard && !accountId) { setError('Select the account the money went into'); return; }
    }
    try {
      await mutation.mutateAsync({
        transferId: transfer.id,
        amount: value,
        collector,
        paymentMethod: collector === 'lolas' ? paymentMethodId : null,
        cashAccountId: collector === 'lolas' && !isCard ? accountId : null,
        isCardPayment: collector === 'lolas' && isCard,
        date,
      });
      onSuccess?.(collector === 'driver' ? 'Recorded: driver collected the fare' : 'Payment recorded');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  }

  return (
    <Modal open onClose={onClose} title="Receive transfer payment" size="md">
      <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-gray-50 p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{transfer.customerName}</p>
          <p className="text-sm text-gray-500">
            {shortRoute(transfer.route)} · {transfer.paxCount} pax · {transfer.serviceDate}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-lg font-bold text-gray-900">{formatCurrency(due)}</p>
          <p className="text-xs text-gray-500">
            due{transfer.amountPaid > 0 ? ` of ${formatCurrency(transferTotal(transfer))}` : ''}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-xs font-medium text-gray-600">Who took the money?</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {([
              { value: 'lolas', title: "Lola's", sub: 'Reception, delivery, pickup or return' },
              { value: 'driver', title: 'Driver', sub: 'Customer paid the driver' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                  collector === opt.value
                    ? 'border-teal-brand bg-teal-brand/5 ring-1 ring-teal-brand'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="collector"
                  value={opt.value}
                  checked={collector === opt.value}
                  onChange={() => setCollector(opt.value)}
                  className="sr-only"
                />
                <span className="block font-medium text-gray-900">{opt.title}</span>
                <span className="block text-xs text-gray-500">{opt.sub}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Amount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          </label>
        </div>

        {collector === 'lolas' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Paid by</span>
              <select value={paymentMethodId} onChange={(e) => { setPaymentMethodId(e.target.value); setCashAccountId(''); }} className={FIELD}>
                {methods.map((pm) => (
                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                ))}
              </select>
            </label>
            {paymentMethodId && !isCard && !routedAccount && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Received into</span>
                <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} className={FIELD}>
                  <option value="">Select account…</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : (
          <p className="text-pretty rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The driver keeps the cash for now. At settlement they hand over{' '}
            <span className="font-semibold tabular-nums">{formatCurrency(Math.max(0, Number(amount || 0) - cut))}</span>{' '}
            after their {formatCurrency(cut)} cut.
          </p>
        )}

        {transfer.billedToOrder && (
          <p className="text-pretty text-xs text-gray-500">
            This fare is part of the rental order&apos;s balance, so the payment is recorded on the order too.
          </p>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
          >
            {mutation.isPending
              ? 'Saving…'
              : collector === 'driver'
                ? 'Driver collected'
                : `Record ${amount ? formatCurrency(Number(amount)) : 'payment'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
