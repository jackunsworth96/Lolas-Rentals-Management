import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import type { AccountBalanceItem } from '../../api/accounting.js';
import { useOwnerPayout } from '../../api/vehicle-owners.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';

interface Props {
  onClose: () => void;
  agreementId: string;
  ownerName: string;
  /** What the books say is owed right now (closed months only). */
  owed: number;
  sourceAccounts: AccountBalanceItem[];
}

export function OwnerPayoutModal({ onClose, agreementId, ownerName, owed, sourceAccounts }: Props) {
  const today = manilaToday();
  const payout = useOwnerPayout(agreementId);
  const defaultSource = sourceAccounts.find((a) => a.accountId === 'SAFE-store-lolas')?.accountId
    ?? sourceAccounts[0]?.accountId ?? '';
  const [fromAccountId, setFromAccountId] = useState(defaultSource);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  const amountNum = Number(amount);
  const source = sourceAccounts.find((a) => a.accountId === fromAccountId);
  const exceedsOwed = amountNum - Math.max(owed, 0) > 0.009;
  const exceedsSource = !!source && amountNum - source.balance > 0.009;
  const canSubmit = amountNum > 0 && !!fromAccountId && !!date && !payout.isPending;

  function submit() {
    payout.mutate({ amount: amountNum, fromAccountId, date, note: note.trim() }, { onSuccess: onClose });
  }

  const inputClass = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50';

  return (
    <Modal open onClose={onClose} title={`Pay ${ownerName}`} size="md">
      <div className="space-y-4">
        <div className={`rounded-lg px-4 py-3 text-sm ${owed >= 0 ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>
          {owed >= 0
            ? <>Owed to {ownerName} from closed months: <span className="font-semibold tabular-nums">{formatCurrency(owed)}</span></>
            : <>{ownerName} owes Lola&apos;s <span className="font-semibold tabular-nums">{formatCurrency(-owed)}</span> from closed months.</>}
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
            {owed > 0 && <Button variant="secondary" type="button" onClick={() => setAmount(owed.toFixed(2))}>Pay all</Button>}
          </div>
          {exceedsOwed && <span className="mt-1 block text-xs text-amber-700">More than closed months show as owed; the difference is an advance.</span>}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Paid from</span>
          <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className={inputClass}>
            {sourceAccounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.accountName} — {formatCurrency(a.balance)}</option>
            ))}
          </select>
          {exceedsSource && <span className="mt-1 block text-xs text-amber-700">This is more than the ledger shows in this account.</span>}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Date</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span></span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. November payout" className={inputClass} />
        </label>

        {source && amountNum > 0 && (
          <div className="space-y-1 rounded-lg bg-gray-50 px-4 py-3 font-mono text-xs text-gray-600">
            <div className="flex justify-between"><span>DR Due to {ownerName}</span><span>{formatCurrency(amountNum)}</span></div>
            <div className="flex justify-between text-gray-400"><span className="pl-4">CR {source.accountName}</span><span>{formatCurrency(amountNum)}</span></div>
          </div>
        )}

        {payout.error && <p className="text-sm text-red-600">{(payout.error as Error).message}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} loading={payout.isPending}>Record payout</Button>
        </div>
      </div>
    </Modal>
  );
}
