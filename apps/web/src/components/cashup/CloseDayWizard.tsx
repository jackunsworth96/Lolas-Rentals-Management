import { useEffect, useMemo, useState } from 'react';
import { CASHUP_VARIANCE_NOTE_THRESHOLD } from '@lolas/shared';
import { useReconcileCash, type CashupSummary } from '../../api/cashup.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatTime } from '../../utils/date.js';
import { Button } from '../common/Button.js';
import { Banner, ExpectedBreakdownCard, methodCategory, shortDate } from './CashupParts.js';
import { DenominationGrid, denomSum, denomsToRecord, formatVariance, varianceColor } from './DenominationCounter.js';
import { DepositRegister } from './DepositRegister.js';
import type { CashupDraft } from './use-cashup-draft.js';

const STEPS = ['Check', 'Count till', 'Count envelope', 'Review', 'Close'] as const;

function CountCheck({ expected, variance }: { expected: number; variance: number }) {
  return (
    <div className="mt-1 flex justify-between text-sm">
      <span className="text-gray-500">Expected {formatCurrency(expected)}</span>
      <span className={`font-semibold tabular-nums ${varianceColor(variance)}`}>
        {variance === 0 ? 'Balanced' : formatVariance(variance)}
      </span>
    </div>
  );
}

interface AccountOption {
  id: string;
  name: string;
}

export function CloseDayWizard({
  summary,
  storeId,
  storeName,
  date,
  dateLabel,
  draft,
  onDraftChange,
  onTillDenom,
  onEnvelopeDenom,
  assetAccounts,
  routedCashAcct,
  defaultDropAcct,
  onRefresh,
  onClose,
  onLocked,
}: {
  summary: CashupSummary;
  storeId: string;
  storeName: string;
  date: string;
  dateLabel: string;
  draft: CashupDraft;
  onDraftChange: (patch: Partial<CashupDraft>) => void;
  onTillDenom: (denom: number, count: number) => void;
  onEnvelopeDenom: (denom: number, count: number) => void;
  assetAccounts: AccountOption[];
  routedCashAcct: string | null | undefined;
  defaultDropAcct: string | null | undefined;
  onRefresh: () => void;
  onClose: () => void;
  onLocked: () => void;
}) {
  const [step, setStep] = useState(0);
  const [dropAmount, setDropAmount] = useState('');
  const [dropCashAcct, setDropCashAcct] = useState(routedCashAcct ?? '');
  const [dropBankAcct, setDropBankAcct] = useState(defaultDropAcct ?? '');
  const reconcile = useReconcileCash();

  useEffect(() => {
    if (step === 3) onRefresh();
  }, [step, onRefresh]);

  const tillCounted = denomSum(draft.tillDenoms);
  const envelopeCounted = denomSum(draft.envelopeDenoms);
  const tillVariance = Math.round((tillCounted - summary.expected.till.total) * 100) / 100;
  const envelopeVariance = Math.round((envelopeCounted - summary.expected.envelope.total) * 100) / 100;
  const needsNote =
    Math.abs(tillVariance) > CASHUP_VARIANCE_NOTE_THRESHOLD ||
    Math.abs(envelopeVariance) > CASHUP_VARIANCE_NOTE_THRESHOLD;
  const drop = parseFloat(dropAmount) || 0;
  const dropInvalid = drop < 0 || drop > tillCounted || (drop > 0 && (!dropCashAcct || !dropBankAcct));

  const exceptions = useMemo(() => {
    const list: Array<{ tone: 'amber' | 'red' | 'blue'; title: string; detail?: string }> = [];
    if (summary.gapTooLong) {
      list.push({
        tone: 'red',
        title: 'More than a month since the last locked cash-up',
        detail: 'The opening float may be wrong. Ask a manager to check before closing.',
      });
    } else if (summary.missingDays.length > 0) {
      list.push({
        tone: 'amber',
        title: `${summary.missingDays.length} day(s) were never cashed up`,
        detail: `${summary.missingDays.map(shortDate).join(', ')}. Their cash movements are included in today's expected figures.`,
      });
    }
    for (const g of summary.carry) {
      list.push({
        tone: 'amber',
        title: `${g.label}: ${g.items.length} entr${g.items.length === 1 ? 'y' : 'ies'} carried into today`,
        detail: g.items
          .map((i) => `${i.bookingToken ? `${i.bookingToken} ` : ''}${i.label} ${i.amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(i.amount))}${i.createdAt ? ` at ${formatTime(i.createdAt)}` : ''}`)
          .join(' · '),
      });
    }
    if ((summary.transactions.pendingExtensions ?? []).length > 0) {
      list.push({
        tone: 'blue',
        title: `${summary.transactions.pendingExtensions.length} unpaid extension(s) — ${formatCurrency(summary.totals.pendingExtensionsTotal)}`,
        detail: summary.transactions.pendingExtensions
          .map((p) => `${p.bookingToken ?? p.customerName ?? 'Customer'} ${formatCurrency(p.amount)}`)
          .join(' · '),
      });
    }
    const mismatched = summary.transactions.depositReturns.filter(
      (r) => r.collectedMethodId && methodCategory(r.collectedMethodId) !== r.methodCategory,
    );
    if (mismatched.length > 0) {
      list.push({
        tone: 'amber',
        title: 'Deposits returned by a different method than they were taken',
        detail: mismatched
          .map((r) => `${r.bookingToken ?? 'Order'}: taken by ${r.collectedMethodId}, returned by ${r.methodId} (${formatCurrency(r.amount)})`)
          .join(' · '),
      });
    }
    const nonCash = summary.transactions.depositReturns.filter((r) => !r.affectsEnvelope);
    if (nonCash.length > 0) {
      list.push({
        tone: 'blue',
        title: `${nonCash.length} deposit return(s) paid by GCash/bank — not taken from the envelope`,
      });
    }
    return list;
  }, [summary]);

  function submit() {
    reconcile.mutate(
      {
        storeId,
        date,
        tillDenoms: denomsToRecord(draft.tillDenoms),
        depositDenoms: denomsToRecord(draft.envelopeDenoms),
        varianceNote: draft.varianceNote.trim() || null,
        cashDrop: drop > 0 ? { amount: drop, cashAccountId: dropCashAcct, bankAccountId: dropBankAcct } : null,
      },
      { onSuccess: onLocked },
    );
  }

  const canNext =
    (step === 1 && tillCounted > 0) ||
    step === 0 ||
    step === 2 ||
    (step === 3 && (!needsNote || draft.varianceNote.trim().length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:px-4 sm:py-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col bg-white shadow-2xl sm:rounded-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Close the day</h2>
              <p className="text-xs text-gray-500">{storeName} · {dateLabel}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">
              Close
            </button>
          </div>
          <ol className="mt-3 flex gap-1">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <p className={`mt-1 hidden text-[11px] sm:block ${i === step ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                  {i + 1}. {s}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Things to know before you count.</p>
              {exceptions.length === 0 ? (
                <Banner tone="green" title="Nothing unusual today" />
              ) : (
                exceptions.map((e, i) => (
                  <Banner key={i} tone={e.tone} title={e.title}>
                    {e.detail}
                  </Banner>
                ))
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="mb-3 text-sm text-gray-600">
                Count everything in the <strong>main till</strong>. Leave the deposit envelope aside.
              </p>
              <DenominationGrid denoms={draft.tillDenoms} onChange={onTillDenom} />
              <div className="mt-3 flex justify-between border-t border-gray-200 pt-3">
                <span className="font-semibold">Till counted</span>
                <span className="text-lg font-bold tabular-nums">{formatCurrency(tillCounted)}</span>
              </div>
              <CountCheck expected={summary.expected.till.total} variance={tillVariance} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Count the <strong>deposit envelope</strong>, then tick each customer deposit you can match.
              </p>
              <DenominationGrid denoms={draft.envelopeDenoms} onChange={onEnvelopeDenom} />
              <div className="flex justify-between border-t border-gray-200 pt-3">
                <span className="font-semibold">Envelope counted</span>
                <span className="text-lg font-bold tabular-nums">{formatCurrency(envelopeCounted)}</span>
              </div>
              <CountCheck expected={summary.expected.envelope.total} variance={envelopeVariance} />
              <DepositRegister
                storeId={storeId}
                ticked={draft.tickedDeposits}
                envelopeCounted={envelopeCounted}
                onToggle={(id) =>
                  onDraftChange({
                    tickedDeposits: draft.tickedDeposits.includes(id)
                      ? draft.tickedDeposits.filter((x) => x !== id)
                      : [...draft.tickedDeposits, id],
                  })
                }
                onTickAll={(ids) => onDraftChange({ tickedDeposits: ids })}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <ExpectedBreakdownCard
                title="Main till"
                openingLabel={summary.openingFloat.previousDate ? `Opening float (${shortDate(summary.openingFloat.previousDate)} close)` : 'Opening float'}
                breakdown={summary.expected.till}
                counted={tillCounted}
              />
              <ExpectedBreakdownCard
                title="Deposit envelope"
                openingLabel="Envelope at last close"
                breakdown={summary.expected.envelope}
                counted={envelopeCounted}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  What explains the difference?{needsNote ? ' *' : ' (optional)'}
                </label>
                <textarea
                  value={draft.varianceNote}
                  onChange={(e) => onDraftChange({ varianceNote: e.target.value })}
                  rows={3}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${needsNote && !draft.varianceNote.trim() ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="e.g. ₱500 change given twice to LR-1104-9C64; ₱1,000 deposit for LR-1012-14AD returned from the till"
                />
                {needsNote && (
                  <p className="mt-1 text-xs text-red-700">
                    Required: a variance is more than {formatCurrency(CASHUP_VARIANCE_NOTE_THRESHOLD)}. Managers see this note.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Till</p>
                  <p className={`font-bold ${varianceColor(tillVariance)}`}>{formatVariance(tillVariance)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Envelope</p>
                  <p className={`font-bold ${varianceColor(envelopeVariance)}`}>{formatVariance(envelopeVariance)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-900">Cash going to the bank or safe now (optional)</h4>
                <p className="mb-3 text-xs text-gray-500">
                  Whatever stays in the till becomes tomorrow&apos;s opening float.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Amount</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={tillCounted}
                      value={dropAmount}
                      onChange={(e) => setDropAmount(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">To account</label>
                    <select
                      value={dropBankAcct}
                      onChange={(e) => setDropBankAcct(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  {!routedCashAcct && (
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-600">From cash account</label>
                      <select
                        value={dropCashAcct}
                        onChange={(e) => setDropCashAcct(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select…</option>
                        {assetAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {drop > tillCounted && (
                  <p className="mt-2 text-xs text-red-700">That is more than the counted till.</p>
                )}
                <div className="mt-3 flex justify-between border-t border-gray-100 pt-2 text-sm">
                  <span className="text-gray-600">Opening float for tomorrow</span>
                  <span className="font-bold tabular-nums">{formatCurrency(Math.max(0, tillCounted - drop))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Envelope carried to tomorrow</span>
                  <span className="font-bold tabular-nums">{formatCurrency(envelopeCounted)}</span>
                </div>
              </div>

              {draft.varianceNote.trim() && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">📝 {draft.varianceNote.trim()}</p>
              )}

              {reconcile.isError && (
                <Banner tone="red" title="Could not lock the day">
                  {(reconcile.error as Error).message}
                </Banner>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            disabled={reconcile.isPending}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!canNext}>
              {step === 1 && tillCounted === 0 ? 'Count the till first' : 'Next'}
            </Button>
          ) : (
            <Button className="flex-1" onClick={submit} loading={reconcile.isPending} disabled={dropInvalid}>
              Lock {shortDate(date)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
