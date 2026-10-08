import { useEffect, useState } from 'react';
import { useCancelActivatedOrder } from '../../api/orders.js';
import { api, ApiError } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';
import { useAuthStore } from '../../stores/auth-store.js';
import type { OrderPayment } from './useOrderDetail.js';
import { Modal } from '../common/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  customerName: string;
  vehicleNames: string;
  recordedPaymentTotal: number;
  payments: OrderPayment[];
  onCancelled: () => void;
}

type Step = 'review' | 'confirm';
type RefundState = { source_payment_id: string; amount_php: number;
  kind: 'rental' | 'deposit'; status: 'reserved' | 'pending' | 'succeeded' | 'failed' | 'reconciliation_required' };

export function CancelActivatedOrderModal({
  open,
  onClose,
  orderId,
  orderReference,
  customerName,
  vehicleNames,
  recordedPaymentTotal,
  payments,
  onCancelled,
}: Props) {
  const cancelOrder = useCancelActivatedOrder();
  const [step, setStep] = useState<Step>('review');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [depositChargeReason, setDepositChargeReason] = useState('');
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [existingRefunds, setExistingRefunds] = useState<RefundState[]>([]);
  const [refundsLoaded, setRefundsLoaded] = useState(false);
  const isAdmin = useAuthStore((state) => state.user?.roleId === 'role-admin');
  const onlineSources = payments.filter((payment) => payment.paymentMethodId === 'xendit'
    && ['card_xendit', 'deposit'].includes(payment.paymentType ?? ''));
  const onlinePaid = onlineSources.length > 0;
  const depositHeld = payments.reduce((total, payment) => total + (
    payment.paymentType === 'deposit' || payment.paymentType === 'security_deposit' ? Number(payment.amount)
      : payment.paymentType === 'deposit_refund' ? -Number(payment.amount) : 0
  ), 0);
  const depositRefund = onlineSources.filter((payment) => payment.paymentType === 'deposit')
    .reduce((total, payment) => total + Number(refundAmounts[payment.id] ?? 0), 0);
  const pendingDepositRefund = existingRefunds.filter((refund) => refund.kind === 'deposit'
    && (refund.status === 'reserved' || refund.status === 'pending'))
    .reduce((total, refund) => total + Number(refund.amount_php), 0);
  const depositChargePHP = Math.max(0, Math.round((depositHeld - pendingDepositRefund - depositRefund) * 100) / 100);
  const hasUncertainRefund = existingRefunds.some((refund) => refund.status === 'reconciliation_required');
  const invalidRefundAmount = onlineSources.some((payment) => {
    const entered = Number(refundAmounts[payment.id] ?? 0);
    const alreadyReserved = existingRefunds.filter((refund) => refund.source_payment_id === payment.id
      && refund.status !== 'failed').reduce((sum, refund) => sum + Number(refund.amount_php), 0);
    return !Number.isFinite(entered) || entered < 0
      || Math.abs(entered * 100 - Math.round(entered * 100)) > 0.001
      || entered > Number(payment.amount) - alreadyReserved + 0.001;
  });
  const onlineDecisionInvalid = !isAdmin || !refundsLoaded || hasUncertainRefund || invalidRefundAmount
    || !Number.isFinite(depositChargePHP) || pendingDepositRefund + depositRefund > depositHeld + 0.001
    || (depositChargePHP > 0 && depositChargeReason.trim().length < 10);
  const trimmedReason = reason.trim();

  useEffect(() => {
    if (!open || !onlinePaid) return;
    let cancelled = false;
    setRefundsLoaded(false);
    void api.get<RefundState[]>(`/payments/xendit/orders/${encodeURIComponent(orderId)}/refunds`)
      .then((rows) => {
        if (!cancelled) { setExistingRefunds(rows); setRefundsLoaded(true); setOnlineError(null); }
      })
      .catch((cause) => {
        if (!cancelled) setOnlineError(cause instanceof ApiError ? cause.message : 'Could not verify pending online refunds.');
      });
    return () => { cancelled = true; };
  }, [open, orderId, onlinePaid]);

  useEffect(() => {
    if (!open) {
      setStep('review');
      setReason('');
      setConfirmation('');
      setRefundAmounts({});
      setDepositChargeReason('');
      setOnlineError(null);
      setExistingRefunds([]);
      setRefundsLoaded(false);
      cancelOrder.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCancel() {
    if (!trimmedReason || confirmation !== 'CANCEL') return;
    if (onlinePaid) {
      if (onlineDecisionInvalid || trimmedReason.length < 10) return;
      const refunds = onlineSources.map((payment) => ({
        sourcePaymentId: payment.id, amountPHP: Number(refundAmounts[payment.id] ?? 0),
      })).filter((refund) => refund.amountPHP > 0);
      setOnlineBusy(true);
      setOnlineError(null);
      void api.post(`/payments/xendit/orders/${encodeURIComponent(orderId)}/cancel-with-refunds`, {
        reason: trimmedReason, refunds, depositChargePHP,
        depositChargeReason: depositChargePHP > 0 ? depositChargeReason.trim() : null,
      }).then(() => { onCancelled(); onClose(); })
        .catch((cause) => setOnlineError(cause instanceof ApiError ? cause.message : 'Could not cancel the booking.'))
        .finally(() => setOnlineBusy(false));
      return;
    }
    cancelOrder.mutate(
      { id: orderId, reason: trimmedReason },
      {
        onSuccess: () => {
          onCancelled();
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'review' ? 'Cancel activated booking?' : 'Confirm cancellation'}
      size="sm"
    >
      {step === 'review' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">{orderReference} · {customerName}</p>
            <p className="mt-1 text-sm text-red-800">{vehicleNames}</p>
          </div>

          <div className="space-y-2 text-sm text-gray-700">
            <p>This removes the booking from Active Orders and releases its assigned vehicles.</p>
            {onlinePaid ? <p className="font-medium text-amber-800">
              Online payments need an administrator refund decision. Refunds remain pending until Xendit confirms them.
            </p> : recordedPaymentTotal > 0 && (
              <p className="font-medium text-amber-800">
                Recorded payments are not refunded automatically. Record any refund separately before or after cancellation.
              </p>
            )}
          </div>

          {onlinePaid && <div className="space-y-2 border-t border-gray-200 pt-3 text-sm">
            {!isAdmin && <p className="text-red-700">An administrator must cancel this online-paid booking.</p>}
            {!refundsLoaded && <p className="text-amber-800">Verifying existing refund requests...</p>}
            {hasUncertainRefund && <p className="text-red-700">A refund needs finance review before cancellation.</p>}
            {pendingDepositRefund > 0 && <p className="text-amber-800">
              Deposit refund already pending: {formatCurrency(pendingDepositRefund)}
            </p>}
            {onlineError && <p role="alert" className="text-red-700">{onlineError}</p>}
            {isAdmin && onlineSources.map((payment) => <label key={payment.id} className="block">
              <span className="text-gray-700">
                {payment.paymentType === 'deposit' ? 'Refund deposit' : 'Refund rental'}
                {' '}from {formatCurrency(Number(payment.amount))}
              </span>
              <input type="number" min="0" max={Math.max(0, Number(payment.amount)
                - existingRefunds.filter((refund) => refund.source_payment_id === payment.id
                  && refund.status !== 'failed').reduce((sum, refund) => sum + Number(refund.amount_php), 0))} step="0.01"
                value={refundAmounts[payment.id] ?? ''}
                onChange={(event) => setRefundAmounts((current) => ({ ...current, [payment.id]: event.target.value }))}
                placeholder="0 for no refund"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
            </label>)}
            {isAdmin && depositChargePHP > 0 && <label className="block">
              <span className="text-gray-700">Document charge for {formatCurrency(depositChargePHP)} not refunded from the held deposit</span>
              <textarea value={depositChargeReason}
                onChange={(event) => setDepositChargeReason(event.target.value)} maxLength={500}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
              <span className="text-xs text-amber-800">The charge remains unresolved for finance; it is not applied automatically.</span>
            </label>}
          </div>}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Cancellation reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Booking was activated by mistake"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              autoFocus
            />
            {!trimmedReason && (
              <span className="mt-1 block text-xs text-gray-500">Required for the booking history.</span>
            )}
          </label>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Keep booking
            </button>
            <button
              type="button"
              onClick={() => setStep('confirm')}
              disabled={!trimmedReason || (onlinePaid && (trimmedReason.length < 10 || onlineDecisionInvalid))}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Type <span className="rounded bg-gray-100 px-1 font-mono font-bold text-gray-900">CANCEL</span> to cancel{' '}
            <span className="font-semibold text-gray-900">{orderReference}</span>. This action cannot be undone.
          </p>

          <input
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Type CANCEL"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />

          {cancelOrder.error && (
            <p role="alert" className="text-sm text-red-600">{(cancelOrder.error as Error).message}</p>
          )}
          {onlineError && <p role="alert" className="text-sm text-red-600">{onlineError}</p>}

          <div className="flex justify-between gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={() => setStep('review')} disabled={cancelOrder.isPending} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Go back
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={confirmation !== 'CANCEL' || cancelOrder.isPending || onlineBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelOrder.isPending || onlineBusy ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
