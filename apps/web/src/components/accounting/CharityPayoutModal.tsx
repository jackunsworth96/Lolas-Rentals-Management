import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { useCharityPayout, type AccountBalanceItem } from '../../api/accounting.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import { CHARITY_WALLET_ID } from '../../pages/accounting/account-helpers.js';

interface Props {
  onClose: () => void;
  /** Accounts the payout can come from, with current balances. */
  sourceAccounts: AccountBalanceItem[];
  /** Amount currently owed to charity. */
  owed: number;
}

export function CharityPayoutModal({ onClose, sourceAccounts, owed }: Props) {
  const today = manilaToday();
  const payout = useCharityPayout();
  const defaultSource = sourceAccounts.find((a) => a.accountId === CHARITY_WALLET_ID)?.accountId
    ?? sourceAccounts[0]?.accountId ?? '';
  const [fromAccountId, setFromAccountId] = useState(defaultSource);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  const amountNum = Number(amount);
  const source = sourceAccounts.find((a) => a.accountId === fromAccountId);
  const exceedsOwed = amountNum - owed > 0.009;
  const exceedsSource = !!source && amountNum - source.balance > 0.009;
  const canSubmit = amountNum > 0 && !exceedsOwed && !!fromAccountId && note.trim().length > 0 && !payout.isPending;

  function submit() {
    payout.mutate(
      { amount: amountNum, fromAccountId, date, note: note.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open onClose={onClose} title="Record charity payout" size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Owed to charity right now: <span className="font-semibold tabular-nums">{formatCurrency(owed)}</span>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Amount paid</span>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
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
            <Button variant="secondary" type="button" onClick={() => setAmount(owed.toFixed(2))}>Pay all</Button>
          </div>
          {exceedsOwed && <span className="mt-1 block text-xs text-red-600">More than is owed.</span>}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Paid from</span>
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          >
            {sourceAccounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountName} — {formatCurrency(a.balance)}
              </option>
            ))}
          </select>
          {exceedsSource && (
            <span className="mt-1 block text-xs text-amber-700">This is more than the ledger shows in this account.</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Date</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Paid to</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Be Pawsitive — November donation"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
          />
        </label>

        {payout.error && <p className="text-sm text-red-600">{(payout.error as Error).message}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} loading={payout.isPending}>Record payout</Button>
        </div>
      </div>
    </Modal>
  );
}
