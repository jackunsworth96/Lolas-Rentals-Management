import { useState, useEffect } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { useCreateMayaCheckout } from '../../api/orders.js';

interface MayaPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  balanceDue: number;
  cardSurchargePercent: number;
}

export function MayaPaymentModal({
  isOpen,
  onClose,
  orderId,
  orderReference,
  balanceDue,
  cardSurchargePercent,
}: MayaPaymentModalProps) {
  const [amount, setAmount] = useState<number>(balanceDue > 0 ? balanceDue : 0);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useCreateMayaCheckout();

  // Reset all state when the modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setAmount(balanceDue > 0 ? balanceDue : 0);
      setRedirectUrl(null);
      setCopied(false);
      mutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const baseAmount = cardSurchargePercent > 0 ? amount / (1 + cardSurchargePercent / 100) : amount;
  const cardFee = amount - baseAmount;

  function handleGenerate() {
    mutation.mutate(
      {
        orderId,
        amountPHP: amount,
        description: `Lola's Rentals \u2013 ${orderReference}`,
      },
      {
        onSuccess: (data) => {
          setRedirectUrl(data.redirectUrl);
        },
      },
    );
  }

  function handleCopy() {
    if (!redirectUrl) return;
    navigator.clipboard.writeText(redirectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleClose() {
    onClose();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="Request Payment via Maya" size="md">
      <div className="space-y-4">
        {/* Amount input */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Amount (PHP)
          </label>
          <input
            type="number"
            step="0.01"
            min="1"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {cardSurchargePercent > 0 && amount > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Includes <span className="font-medium">₱{cardFee.toFixed(2)}</span> card fee ({cardSurchargePercent}%)
            </p>
          )}
        </div>

        {/* Generate button */}
        {!redirectUrl && (
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={mutation.isPending || amount <= 0}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mutation.isPending ? 'Generating…' : 'Generate Payment Link'}
            </button>
            {mutation.error && (
              <p className="mt-2 text-sm text-red-600">
                {(mutation.error as Error).message}
              </p>
            )}
          </div>
        )}

        {/* Result URL */}
        {redirectUrl && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Payment Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={redirectUrl}
                className="block flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Link2 className="h-4 w-4" />
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Send this link to your customer via WhatsApp or Viber. The order will update
              automatically once payment is confirmed.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
