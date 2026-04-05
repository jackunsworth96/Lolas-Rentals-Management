import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { usePostOwnerDrawings, type OwnerDrawingsPayload } from '../../api/accounting.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer';

const METHOD_OPTIONS: { value: PaymentMethod; label: string; accountId: string }[] = [
  { value: 'cash',           label: 'Cash (CASH-LOLA)',                        accountId: 'CASH-LOLA' },
  { value: 'gcash',          label: 'GCash (GCASH-store-lolas)',                accountId: 'GCASH-store-lolas' },
  { value: 'bank_transfer',  label: 'Bank Transfer (BANK-UNION-BANK-store-lolas)', accountId: 'BANK-UNION-BANK-store-lolas' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OwnerDrawingsModal({ isOpen, onClose }: Props) {
  const mutation = usePostOwnerDrawings();

  const [amount, setAmount] = useState(50000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(todayStr);
  const [note, setNote] = useState('');

  const canSubmit = amount > 0 && !!date && !mutation.isPending;

  function handleSubmit() {
    const payload: OwnerDrawingsPayload = {
      amount,
      paymentMethod,
      date,
      note: note.trim() || undefined,
    };
    mutation.mutate(payload, {
      onSuccess: () => {
        handleClose();
      },
    });
  }

  function handleClose() {
    setAmount(50000);
    setPaymentMethod('cash');
    setDate(todayStr());
    setNote('');
    mutation.reset();
    onClose();
  }

  const selectedMethod = METHOD_OPTIONS.find((m) => m.value === paymentMethod);

  return (
    <Modal open={isOpen} onClose={handleClose} title="Owner Drawings" size="sm">
      <div className="space-y-4">
        {/* Journal preview */}
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1 font-mono">
          <div className="flex justify-between">
            <span>DR OWNER-DRAWINGS-store-lolas</span>
            <span>{formatCurrency(amount || 0)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span className="pl-4">CR {selectedMethod?.accountId ?? '—'}</span>
            <span>{formatCurrency(amount || 0)}</span>
          </div>
        </div>

        {/* Amount */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Amount</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">₱</span>
            <input
              type="number"
              min={1}
              step={100}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="block w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </label>

        {/* Payment method */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Payment method</span>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>

        {/* Date */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>

        {/* Note */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span></span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Monthly owner salary"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>

        {mutation.error && (
          <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Posting...' : 'Post Drawing'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
