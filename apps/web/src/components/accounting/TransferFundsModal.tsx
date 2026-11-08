import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { useTransferFunds, type AccountBalanceItem } from '../../api/accounting.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';

interface Props {
  onClose: () => void;
  /** Cash, bank and e-wallet accounts with current balances. */
  accounts: AccountBalanceItem[];
}

export function TransferFundsModal({ onClose, accounts }: Props) {
  const today = manilaToday();
  const transfer = useTransferFunds();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');

  const amountNum = Number(amount);
  const fromAcct = accounts.find((a) => a.accountId === from);
  const toAcct = accounts.find((a) => a.accountId === to);
  const canSubmit = !!from && !!to && from !== to && amountNum > 0 && date <= today && !transfer.isPending;

  function submit() {
    transfer.mutate(
      {
        fromAccountId: from,
        toAccountId: to,
        amount: amountNum,
        date,
        description: description.trim() || `Transfer ${fromAcct?.accountName ?? ''} → ${toAcct?.accountName ?? ''}`,
      },
      { onSuccess: onClose },
    );
  }

  const selectClass = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50';

  return (
    <Modal open onClose={onClose} title="Transfer funds" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Record money moving between your own accounts, e.g. safe to bank, bank to Wise, or till to GCash.
        </p>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass}>
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.accountName} — {formatCurrency(a.balance)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={selectClass}>
            <option value="">Select account</option>
            {accounts.filter((a) => a.accountId !== from).map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.accountName} — {formatCurrency(a.balance)}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Amount</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">₱</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="block w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm tabular-nums focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Date</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={selectClass} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Description <span className="font-normal text-gray-400">(optional)</span></span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Safe cash deposited at BDO"
            className={selectClass}
          />
        </label>

        {fromAcct && toAcct && amountNum > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <div className="flex justify-between">
              <span>{fromAcct.accountName}</span>
              <span className="tabular-nums">{formatCurrency(fromAcct.balance)} → <strong>{formatCurrency(fromAcct.balance - amountNum)}</strong></span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>{toAcct.accountName}</span>
              <span className="tabular-nums">{formatCurrency(toAcct.balance)} → <strong>{formatCurrency(toAcct.balance + amountNum)}</strong></span>
            </div>
            {fromAcct.balance - amountNum < -0.009 && (
              <p className="mt-2 text-xs text-amber-700">This takes {fromAcct.accountName} below zero in the ledger. Check the amount.</p>
            )}
          </div>
        )}

        {transfer.error && <p className="text-sm text-red-600">{(transfer.error as Error).message}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} loading={transfer.isPending}>Transfer</Button>
        </div>
      </div>
    </Modal>
  );
}
