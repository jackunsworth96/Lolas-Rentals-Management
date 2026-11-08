import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import {
  usePostOwnerDrawings,
  type AccountBalanceItem,
  type OwnerDrawingsPayload,
} from '../../api/accounting.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Cash, bank and e-wallet accounts the drawing can come from. */
  accounts: AccountBalanceItem[];
}

type PaymentMethod = OwnerDrawingsPayload['paymentMethod'];

function methodFor(account: AccountBalanceItem | undefined): PaymentMethod {
  const n = account?.accountName.toLowerCase() ?? '';
  if (n.includes('gcash')) return 'gcash';
  if (/bank|wise|bdo|union/.test(n)) return 'bank_transfer';
  return 'cash';
}

export function OwnerDrawingsModal({ isOpen, onClose, accounts }: Props) {
  const mutation = usePostOwnerDrawings();
  const defaultAccountId = accounts.find((a) => a.accountId === 'CASH-LOLA')?.accountId ?? accounts[0]?.accountId ?? '';

  const [amount, setAmount] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [date, setDate] = useState(manilaToday);
  const [note, setNote] = useState('');

  const effectiveAccountId = fromAccountId || defaultAccountId;
  const source = accounts.find((a) => a.accountId === effectiveAccountId);
  const amountNum = Number(amount);
  const canSubmit = amountNum > 0 && !!effectiveAccountId && !!date && !mutation.isPending;

  function handleSubmit() {
    mutation.mutate(
      {
        amount: amountNum,
        paymentMethod: methodFor(source),
        fromAccountId: effectiveAccountId,
        date,
        note: note.trim() || undefined,
      },
      { onSuccess: handleClose },
    );
  }

  function handleClose() {
    setAmount('');
    setFromAccountId('');
    setDate(manilaToday());
    setNote('');
    mutation.reset();
    onClose();
  }

  const inputClass = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50';

  return (
    <Modal open={isOpen} onClose={handleClose} title="Owner drawings" size="sm">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Amount</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">₱</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="block w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm tabular-nums focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
            />
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Paid from</span>
          <select value={effectiveAccountId} onChange={(e) => setFromAccountId(e.target.value)} className={inputClass}>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.accountName} — {formatCurrency(a.balance)}</option>
            ))}
          </select>
          {source && amountNum - source.balance > 0.009 && (
            <span className="mt-1 block text-xs text-amber-700">More than the ledger shows in this account.</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Date</span>
          <input type="date" value={date} max={manilaToday()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span></span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Monthly owner salary"
            className={inputClass}
          />
        </label>

        {source && amountNum > 0 && (
          <div className="space-y-1 rounded-lg bg-gray-50 px-4 py-3 font-mono text-xs text-gray-600">
            <div className="flex justify-between"><span>DR Owner&apos;s Withdrawals</span><span>{formatCurrency(amountNum)}</span></div>
            <div className="flex justify-between text-gray-400"><span className="pl-4">CR {source.accountName}</span><span>{formatCurrency(amountNum)}</span></div>
          </div>
        )}

        {mutation.error && <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>}

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
            {mutation.isPending ? 'Posting…' : 'Post drawing'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
