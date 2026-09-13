import { useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { useCreateXenditSession } from '../../api/orders.js';
import { Modal } from '../common/Modal.js';

interface XenditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  balanceDue: number;
  paymentMethodId: string;
  surchargePercent: number;
}

export function XenditPaymentModal({
  isOpen,
  onClose,
  orderId,
  orderReference,
  balanceDue,
  paymentMethodId,
  surchargePercent,
}: XenditPaymentModalProps) {
  const [principalAmount, setPrincipalAmount] = useState(balanceDue > 0 ? balanceDue : 0);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  const mutation = useCreateXenditSession();

  useEffect(() => {
    if (!isOpen) return;
    setPrincipalAmount(balanceDue > 0 ? balanceDue : 0);
    setCheckoutUrl(null);
    setSessionId(null);
    setCopied(false);
    mutation.reset();
    // Reset only when the modal is opened for a new balance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, balanceDue]);

  const surcharge = Math.round(principalAmount * surchargePercent) / 100;
  const customerTotal = principalAmount + surcharge;

  function handleGenerate() {
    mutation.mutate(
      {
        orderId,
        principalAmountPHP: principalAmount,
        paymentMethodId,
        description: `Lola's Rentals - ${orderReference}`,
      },
      { onSuccess: (data) => { setCheckoutUrl(data.checkoutUrl); setSessionId(data.sessionId); } },
    );
  }

  async function handleCopy() {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCancelCheckout() {
    if (!sessionId) return;
    setCancelling(true);
    try {
      await api.post(`/payments/xendit/sessions/${encodeURIComponent(sessionId)}/cancel`, {});
      setCheckoutUrl(null);
      setSessionId(null);
      mutation.reset();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Request Payment via Xendit" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount to collect (PHP)</label>
          <input
            type="number"
            step="0.01"
            min="1"
            max={balanceDue}
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(Number(event.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {surchargePercent > 0 && principalAmount > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Customer pays ₱{customerTotal.toFixed(2)}, including ₱{surcharge.toFixed(2)} fee ({surchargePercent}%).
            </p>
          )}
        </div>

        {!checkoutUrl && (
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={mutation.isPending || principalAmount <= 0 || principalAmount > balanceDue}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mutation.isPending ? 'Generating...' : 'Generate Payment Link'}
            </button>
            {mutation.error && <p className="mt-2 text-sm text-red-600">{(mutation.error as Error).message}</p>}
          </div>
        )}

        {checkoutUrl && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Payment Link</label>
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={checkoutUrl} className="block min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
              <button type="button" onClick={() => void handleCopy()} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Link2 className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500">Send this hosted checkout link to the customer. Payment is recorded only after the verified Xendit webhook arrives.</p>
            <button
              type="button"
              onClick={() => void handleCancelCheckout()}
              disabled={cancelling}
              className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling checkout...' : 'Cancel checkout before changing this order'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
