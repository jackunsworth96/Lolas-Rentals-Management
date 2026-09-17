import { useEffect, useState } from 'react';
import { useCancelActivatedOrder } from '../../api/orders.js';
import { Modal } from '../common/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  customerName: string;
  vehicleNames: string;
  recordedPaymentTotal: number;
  onCancelled: () => void;
}

type Step = 'review' | 'confirm';

export function CancelActivatedOrderModal({
  open,
  onClose,
  orderId,
  orderReference,
  customerName,
  vehicleNames,
  recordedPaymentTotal,
  onCancelled,
}: Props) {
  const cancelOrder = useCancelActivatedOrder();
  const [step, setStep] = useState<Step>('review');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const trimmedReason = reason.trim();

  useEffect(() => {
    if (!open) {
      setStep('review');
      setReason('');
      setConfirmation('');
      cancelOrder.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCancel() {
    if (!trimmedReason || confirmation !== 'CANCEL') return;
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
            {recordedPaymentTotal > 0 && (
              <p className="font-medium text-amber-800">
                Recorded payments are not refunded automatically. Record any refund separately before or after cancellation.
              </p>
            )}
          </div>

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
              disabled={!trimmedReason}
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

          <div className="flex justify-between gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={() => setStep('review')} disabled={cancelOrder.isPending} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Go back
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={confirmation !== 'CANCEL' || cancelOrder.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelOrder.isPending ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
