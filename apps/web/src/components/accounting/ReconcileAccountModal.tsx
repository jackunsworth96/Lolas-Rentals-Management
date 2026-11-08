import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import {
  useAccountSummary,
  useReconcileAccount,
  type AccountBalanceItem,
} from '../../api/accounting.js';
import { formatCurrency } from '../../utils/currency.js';
import { manilaToday } from '../../utils/date.js';
import {
  RECON_ADJ_EQUITY_ID,
  formatShortDate,
  isCreditNormal,
  toDisplay,
} from '../../pages/accounting/account-helpers.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Asset and liability accounts that can be counted. */
  accounts: AccountBalanceItem[];
  /** Expense / income / equity accounts the difference may be booked to. */
  offsetAccounts: AccountBalanceItem[];
  initialAccountId?: string | null;
}

export function ReconcileAccountModal({ open, onClose, accounts, offsetAccounts, initialAccountId }: Props) {
  const today = manilaToday();
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [asOfDate, setAsOfDate] = useState(today);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [offsetAccountId, setOffsetAccountId] = useState(RECON_ADJ_EQUITY_ID);
  const reconcile = useReconcileAccount();

  useEffect(() => {
    if (!open) return;
    setAccountId(initialAccountId ?? '');
    setAsOfDate(today);
    setCounted('');
    setNotes('');
    setOffsetAccountId(RECON_ADJ_EQUITY_ID);
    reconcile.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialAccountId]);

  const account = accounts.find((a) => a.accountId === accountId) ?? null;
  const { data: summary, isFetching } = useAccountSummary(accountId, asOfDate, asOfDate);

  const ledgerDisplay = summary && account ? toDisplay(summary.closingBalance, account.accountType) : null;
  const countedNum = counted.trim() === '' ? null : Number(counted);
  const variance = ledgerDisplay != null && countedNum != null && Number.isFinite(countedNum)
    ? Math.round((countedNum - ledgerDisplay) * 100) / 100
    : null;
  const lastCount = summary?.reconciliations[0] ?? null;

  const offsetOptions = useMemo(() => {
    const preferred = offsetAccounts.filter((a) =>
      a.accountId === RECON_ADJ_EQUITY_ID || /shortage|overage|over\/short/i.test(a.accountName),
    );
    return preferred.length > 0 ? preferred : offsetAccounts;
  }, [offsetAccounts]);

  const canSubmit = !!account && countedNum != null && Number.isFinite(countedNum)
    && notes.trim().length >= 3 && asOfDate <= today && !reconcile.isPending;

  function submit() {
    if (!account || countedNum == null) return;
    reconcile.mutate({
      accountId: account.accountId,
      asOfDate,
      countedBalance: countedNum,
      notes: notes.trim(),
      offsetAccountId,
    });
  }

  const done = reconcile.data;

  return (
    <Modal open={open} onClose={onClose} title="Reconcile account" size="md">
      {done ? (
        <div className="space-y-4 text-sm">
          <div className={`rounded-lg p-4 ${Math.abs(done.variance) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
            {Math.abs(done.variance) < 0.01 ? (
              <p className="font-semibold">Count matches the ledger. Recorded as reconciled.</p>
            ) : (
              <>
                <p className="font-semibold">
                  Difference of {formatCurrency(Math.abs(done.variance))} posted so the ledger matches your count.
                </p>
                <p className="mt-1">Investigate the cause and note it in the account history if you find it.</p>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter what you actually counted, or what the bank or e-wallet statement shows. If it differs
            from the ledger, an adjustment is posted and the difference is kept in the account history.
          </p>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Account</span>
            <select
              value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setCounted(''); }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Counted on</span>
            <input
              type="date"
              value={asOfDate}
              max={today}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
            />
            <span className="mt-1 block text-xs text-gray-500">Includes everything posted up to the end of this day.</span>
          </label>

          {account && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Ledger says</p>
                <p className="font-semibold tabular-nums text-gray-900">
                  {isFetching || ledgerDisplay == null ? '…' : formatCurrency(ledgerDisplay)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Last counted</p>
                <p className="text-gray-700">
                  {lastCount
                    ? `${formatShortDate(lastCount.asOfDate)} · ${formatCurrency(toDisplay(lastCount.countedBalance, account.accountType))}`
                    : 'Never'}
                </p>
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              {account && isCreditNormal(account.accountType) ? 'Amount actually owed' : 'Counted / statement balance'}
            </span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">₱</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0.00"
                className="block w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm tabular-nums focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
              />
            </div>
          </label>

          {variance != null && (
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${
              Math.abs(variance) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
            }`}>
              {Math.abs(variance) < 0.01
                ? 'Matches the ledger.'
                : `${variance > 0 ? 'More' : 'Less'} than the ledger by ${formatCurrency(Math.abs(variance))}.`}
            </div>
          )}

          {variance != null && Math.abs(variance) >= 0.01 && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Book the difference to</span>
              <select
                value={offsetAccountId}
                onChange={(e) => setOffsetAccountId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
              >
                {offsetOptions.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.accountName}{a.accountId === RECON_ADJ_EQUITY_ID ? ' (unexplained — investigate)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Note</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Safe counted by Jack and Lola, Wise statement 8 Nov"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-2 focus:ring-teal-brand/50"
            />
          </label>

          {reconcile.error && (
            <p className="text-sm text-red-600">{(reconcile.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit} loading={reconcile.isPending}>
              {variance != null && Math.abs(variance) >= 0.01 ? 'Record count and adjust' : 'Record count'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
