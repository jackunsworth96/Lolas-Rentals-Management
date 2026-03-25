import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useRecordDriverPayment, moneyAmount, type TransferRow } from '../../api/transfers.js';
import { useChartOfAccounts } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  transfer: TransferRow;
  storeId: string;
}

export function DriverPaymentModal({ open, onClose, transfer, storeId }: Props) {
  const mutation = useRecordDriverPayment();
  const { data: accounts = [] } = useChartOfAccounts();

  const accList = accounts as Array<{ id: string; name: string; accountType?: string; storeId?: string | null }>;
  const storeAccounts = useMemo(
    () => accList.filter((a) => !a.storeId || a.storeId === storeId),
    [accList, storeId],
  );
  const expenseAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'expense');
  const assetAccounts = storeAccounts.filter((a) => (a.accountType ?? '').toLowerCase() === 'asset');

  const totalPrice = moneyAmount(transfer.totalPrice);
  const existingDriverFee = moneyAmount(transfer.driverFee);

  const [driverFee, setDriverFee] = useState<number | ''>('');
  const [driverExpenseAccountId, setDriverExpenseAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDriverFee(existingDriverFee > 0 ? existingDriverFee : '');
      setDriverExpenseAccountId('');
      setCashAccountId('');
      setError('');
    }
  }, [open, existingDriverFee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!driverFee || driverFee <= 0) { setError('Driver fee must be positive'); return; }
    if (!driverExpenseAccountId) { setError('Select a driver expense account'); return; }
    if (!cashAccountId) { setError('Select a payment account'); return; }

    try {
      await mutation.mutateAsync({
        transferId: transfer.id,
        driverFee: Number(driverFee),
        date: new Date().toISOString().slice(0, 10),
        driverExpenseAccountId,
        cashAccountId,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record driver payment');
    }
  }

  if (!open) return null;

  const netProfit = Number(driverFee) > 0 ? totalPrice - Number(driverFee) : totalPrice;

  return (
    <Modal open onClose={onClose} title="Record Driver Payment" size="lg">
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">{transfer.customerName}</p>
            <p className="text-sm text-gray-500">{transfer.route} · {transfer.serviceDate}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPrice)}</p>
            {transfer.driverPaidStatus === 'Paid' && (
              <p className="text-xs text-green-600">Driver already paid: {formatCurrency(existingDriverFee)}</p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Driver Fee *</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={driverFee}
            onChange={(e) => setDriverFee(e.target.value ? Number(e.target.value) : '')}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {Number(driverFee) > 0 && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm">
            <span className="text-gray-600">Net profit: </span>
            <span className={`font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(netProfit)}
            </span>
            <span className="text-gray-500"> ({formatCurrency(totalPrice)} − {formatCurrency(Number(driverFee))})</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Debit Account (Driver Expense) *</span>
            <select
              value={driverExpenseAccountId}
              onChange={(e) => setDriverExpenseAccountId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select...</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Credit Account (Cash/GCash) *</span>
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
          </label>
        </div>

        <p className="text-xs text-gray-500">
          Journal entry: Debit driver fee expense, Credit cash/payment account
        </p>

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
            {mutation.isPending ? 'Recording...' : 'Record Driver Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
