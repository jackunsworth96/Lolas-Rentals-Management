import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useCancelRawOrder, type RawOrder } from '../../api/orders-raw.js';

interface Props {
  open: boolean;
  onClose: () => void;
  rawOrder: RawOrder;
  onCancelled: (id: string) => void;
}

function getCustomerName(order: RawOrder): string {
  if (order.customer_name) return order.customer_name;
  const payload = order.payload as Record<string, unknown> | undefined;
  if (payload) {
    const billing = payload.billing as Record<string, unknown> | undefined;
    if (billing) {
      const full = `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim();
      if (full) return full;
    }
    const name = payload.customer_name ?? payload.name;
    if (name) return String(name);
  }
  return 'this customer';
}

function getReference(order: RawOrder): string {
  if (order.order_reference) return order.order_reference;
  const payload = order.payload as Record<string, unknown> | undefined;
  if (payload) {
    const ref = payload.number ?? payload.id ?? payload.order_key;
    if (ref) return String(ref);
  }
  return order.id;
}

type Step = 'confirm' | 'type-cancel';

export function CancelOrderModal({ open, onClose, rawOrder, onCancelled }: Props) {
  const cancel = useCancelRawOrder();

  const [step, setStep] = useState<Step>('confirm');
  const [reason, setReason] = useState('');
  const [confirmInput, setConfirmInput] = useState('');

  const reference = getReference(rawOrder);
  const customerName = getCustomerName(rawOrder);
  const canConfirm = confirmInput === 'CANCEL';

  useEffect(() => {
    if (!open) {
      setStep('confirm');
      setReason('');
      setConfirmInput('');
      cancel.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleProceedToStep2() {
    setStep('type-cancel');
  }

  function handleConfirm() {
    if (!canConfirm) return;
    cancel.mutate(
      { id: rawOrder.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          onCancelled(rawOrder.id);
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'confirm' ? 'Cancel this booking?' : 'Confirm cancellation'}
      size="sm"
    >
      {step === 'confirm' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This will cancel order{' '}
            <span className="font-semibold text-gray-900">{reference}</span>.{' '}
            <span className="font-medium text-red-600">This cannot be undone.</span>
          </p>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer requested cancellation"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={handleProceedToStep2}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Yes, Cancel Booking
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            You are about to cancel{' '}
            <span className="font-semibold text-gray-900">{reference}</span>{' '}
            for{' '}
            <span className="font-semibold text-gray-900">{customerName}</span>.
            Type{' '}
            <span className="rounded bg-gray-100 px-1 font-mono font-bold text-gray-900">CANCEL</span>{' '}
            to confirm.
          </p>

          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder="Type CANCEL"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />

          {cancel.error && (
            <p className="text-sm text-red-600">{(cancel.error as Error).message}</p>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || cancel.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancel.isPending ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
