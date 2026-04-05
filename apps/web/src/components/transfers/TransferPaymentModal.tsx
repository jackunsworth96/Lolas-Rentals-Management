import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useRecordTransferPayment, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { Badge } from '../common/Badge.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';

interface Props {
  open: boolean;
  onClose: () => void;
  transfer: TransferRow;
  storeId: string;
}

export function TransferPaymentModal({ open, onClose, transfer, storeId }: Props) {
  const mutation = useRecordTransferPayment();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const { data: accounts = [] } = useChartOfAccounts();

  const pmList = paymentMethods as Array<{ id: string; name: string }>;
  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;

  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId || a.storeId === 'company'),
    [accList, storeId],
  );
  const assetAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');
  const transferIncomeAccounts = accList.filter(
    (a) => a.id === `INCOME-TRANSFER-${storeId}` || a.id === `MISC-INCOME-${storeId}`,
  );

  const totalPrice = moneyAmount(transfer.totalPrice);

  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [amount, setAmount] = useState<number | ''>(totalPrice);
  const [cashAccountId, setCashAccountId] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [settlementRef, setSettlementRef] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPaymentMethodId('');
      setAmount(totalPrice);
      setCashAccountId('');
      setIncomeAccountId('');
      setSettlementRef('');
      setError('');
    }
  }, [open, totalPrice]);

  const routing = usePaymentRouting();
  const routedCashAcct = routing.getReceivedInto(storeId, paymentMethodId);

  useEffect(() => {
    if (routedCashAcct && !cashAccountId) setCashAccountId(routedCashAcct);
  }, [routedCashAcct, cashAccountId]);

  const isCard = useMemo(() => {
    const pm = pmList.find((p) => p.id === paymentMethodId);
    return pm ? pm.name.toLowerCase().includes('card') : false;
  }, [paymentMethodId, pmList]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!paymentMethodId) { setError('Select a payment method'); return; }
    if (!amount || amount <= 0) { setError('Amount must be positive'); return; }

    if (isCard) {
      setError('Card payment recording is not yet implemented. Use the Card Settlements page after recording.');
      return;
    }

    if (!cashAccountId || !incomeAccountId) {
      setError('Select both debit and credit accounts');
      return;
    }

    try {
      await mutation.mutateAsync({
        transferId: transfer.id,
        amount: Number(amount),
        paymentMethod: paymentMethodId,
        date: new Date().toISOString().slice(0, 10),
        cashAccountId,
        transferIncomeAccountId: incomeAccountId,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  }

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="Record Transfer Payment" size="lg">
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">{transfer.customerName}</p>
            <p className="text-sm text-gray-500">{transfer.route} · {transfer.serviceDate}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPrice)}</p>
            <Badge color={transfer.paymentStatus === 'Paid' ? 'green' : transfer.paymentStatus === 'Partially Paid' ? 'yellow' : 'red'}>
              {transfer.paymentStatus}
            </Badge>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Payment Method *</span>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select...</option>
              {pmList.map((pm) => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Amount *</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {isCard && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Settlement Reference</span>
            <input
              type="text"
              value={settlementRef}
              onChange={(e) => setSettlementRef(e.target.value)}
              placeholder="Card terminal reference number"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-yellow-700">
              Card payments create a pending settlement — no journal entry until settlement is matched.
            </p>
          </label>
        )}

        {!isCard && paymentMethodId && (
          <div className="grid grid-cols-2 gap-3">
            {!routedCashAcct && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Debit Account (Cash/GCash) *</span>
              <select
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>
            </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Credit Account (Income) *</span>
              <select
                value={incomeAccountId}
                onChange={(e) => setIncomeAccountId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {transferIncomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
