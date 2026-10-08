import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { useChartOfAccounts } from '../../api/config.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { formatCurrency } from '../../utils/currency.js';
import type { OrderPayment } from './useOrderDetail.js';

type Refund = {
  id: string;
  source_payment_id: string;
  amount_php: number;
  kind: 'rental' | 'deposit';
  status: 'reserved' | 'pending' | 'succeeded' | 'failed' | 'reconciliation_required';
  processing_error: string | null;
};

type CancellationDecision = {
  deposit_charge_php: number;
  deposit_charge_reason: string | null;
  deposit_charge_status: 'pending_finance_review' | 'not_applicable' | 'resolved';
};

export function XenditRefundPanel({ orderId, storeId, payments }: { orderId: string; storeId: string; payments: OrderPayment[] }) {
  const queryClient = useQueryClient();
  const seenCompleted = useRef(new Set<string>());
  const isAdmin = useAuthStore((state) => state.user?.roleId === 'role-admin');
  const { data: accounts = [] } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [decision, setDecision] = useState<CancellationDecision | null>(null);
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sources = payments.filter((payment) => payment.paymentMethodId === 'xendit'
    && (payment.paymentType === 'card_xendit' || payment.paymentType === 'deposit'));
  const incomeAccounts = accounts.filter((account) => {
    const accountStore = String(account.storeId ?? account.store_id ?? '');
    const accountType = String(account.accountType ?? account.account_type ?? '').toLowerCase();
    return account.isActive !== false && account.is_active !== false
      && (accountStore === storeId || accountStore === 'company') && accountType === 'income';
  });

  async function refresh() {
    try {
      const path = `/payments/xendit/orders/${encodeURIComponent(orderId)}`;
      const [nextRefunds, nextDecision] = await Promise.all([
        api.get<Refund[]>(`${path}/refunds`),
        api.get<CancellationDecision | null>(`${path}/cancellation-decision`),
      ]);
      setRefunds(nextRefunds);
      setDecision(nextDecision);
      const newlyCompleted = nextRefunds.filter((refund) => refund.status === 'succeeded'
        && !seenCompleted.current.has(refund.id));
      for (const refund of newlyCompleted) seenCompleted.current.add(refund.id);
      if (newlyCompleted.length > 0) void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not verify online refund status.');
    }
  }

  useEffect(() => {
    if (sources.length === 0) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [orderId, sources.length]);

  if (sources.length === 0) return null;
  const selected = sources.find((payment) => payment.id === sourceId);
  const reserved = refunds.filter((refund) => refund.source_payment_id === sourceId
    && ['reserved', 'pending', 'succeeded', 'reconciliation_required'].includes(refund.status))
    .reduce((total, refund) => total + Number(refund.amount_php), 0);
  const remaining = Math.max(0, Number(selected?.amount ?? 0) - reserved);

  async function requestRefund() {
    const requested = Number(amount);
    if (!selected || !Number.isFinite(requested) || requested <= 0 || requested > remaining || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/payments/xendit/orders/${encodeURIComponent(orderId)}/refunds`, {
        sourcePaymentId: sourceId, amountPHP: requested, reason: reason.trim(),
      });
      setAmount('');
      setReason('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not request the online refund.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveCharge() {
    if (!incomeAccountId || decision?.deposit_charge_status !== 'pending_finance_review') return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/payments/xendit/orders/${encodeURIComponent(orderId)}/resolve-deposit-charge`, { incomeAccountId });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not resolve the deposit charge.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Xendit refunds</h3>
      <p className="mt-1 text-xs text-gray-600">A refund request is not complete until Xendit confirms it.</p>
      {refunds.length > 0 && <ul className="mt-2 space-y-1 text-sm">
        {refunds.map((refund) => <li key={refund.id}>
          {refund.kind === 'deposit' ? 'Deposit' : 'Rental'} {formatCurrency(Number(refund.amount_php))}: {' '}
          <strong>{refund.status === 'succeeded' ? 'Processed by Xendit' : refund.status === 'failed' ? 'Failed'
            : refund.status === 'reconciliation_required' ? 'Finance review required' : 'Refund pending'}</strong>
        </li>)}
      </ul>}
      {decision && decision.deposit_charge_php > 0 && <div className="mt-3 border border-amber-300 bg-amber-50 p-3 text-sm">
        <p className="font-medium">Documented deposit charge: {formatCurrency(Number(decision.deposit_charge_php))}</p>
        <p>{decision.deposit_charge_reason}</p>
        <p className="mt-1">{decision.deposit_charge_status === 'resolved'
          ? 'Applied to the deposit liability.' : 'Deposit remains held pending finance resolution.'}</p>
        {isAdmin && decision.deposit_charge_status === 'pending_finance_review' && <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="Deposit charge income account" value={incomeAccountId}
            onChange={(event) => setIncomeAccountId(event.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm">
            <option value="">Select income account</option>
            {incomeAccounts.map((account) => <option key={String(account.id)} value={String(account.id)}>{String(account.name)}</option>)}
          </select>
          <button type="button" onClick={() => void resolveCharge()} disabled={busy || !incomeAccountId}
            className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Apply documented charge
          </button>
        </div>}
      </div>}
      {isAdmin && <div className="mt-3 space-y-2">
        <select aria-label="Online payment to refund" value={sourceId}
          onChange={(event) => { setSourceId(event.target.value); setAmount(''); }}
          className="w-full rounded border border-gray-300 px-2 py-2 text-sm">
          <option value="">Select confirmed payment</option>
          {sources.map((payment) => <option key={payment.id} value={payment.id}>
            {payment.paymentType === 'deposit' ? 'Deposit' : 'Rental'}: {formatCurrency(Number(payment.amount))}
          </option>)}
        </select>
        {selected && <p className="text-xs text-gray-600">Available before other adjustments: {formatCurrency(remaining)}</p>}
        <input aria-label="Online refund amount" type="number" min="0.01" max={remaining} step="0.01"
          value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Refund amount"
          className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
        <textarea aria-label="Online refund reason" minLength={10} maxLength={500}
          value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for refund"
          className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
        <button type="button" onClick={() => void requestRefund()}
          disabled={busy || !selected || Number(amount) <= 0 || Number(amount) > remaining || reason.trim().length < 10}
          className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Requesting...' : 'Request online refund'}
        </button>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
