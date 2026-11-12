import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { usePartners } from '../../api/partners.js';
import {
  usePreviewAssignPartnerToRawOrder,
  useAssignPartnerToRawOrder,
  type AssignPartnerToRawOrderPreview,
  type AssignPartnerToRawOrderResult,
} from '../../api/orders-raw.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  rawOrderId: string;
  storeId: string;
  onAssigned: (result: AssignPartnerToRawOrderResult) => void;
}

const SELECT_CLS = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

/**
 * Inbox counterpart of AssignPartnerModal: attributes an unprocessed booking
 * to a partner before activation. See
 * apps/api/src/use-cases/orders/assign-partner-to-raw-order.ts.
 */
export function AssignPartnerToRawOrderModal({ open, onClose, rawOrderId, storeId, onAssigned }: Props) {
  const { data: partnersRaw } = usePartners(storeId);
  const partners = (partnersRaw ?? []) as Array<{ id: string; slug: string; name: string; active: boolean; status: string }>;
  const activePartners = partners.filter((p) => p.active && p.status === 'active');

  const [partnerSlug, setPartnerSlug] = useState('');
  const [preview, setPreview] = useState<AssignPartnerToRawOrderPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewMut = usePreviewAssignPartnerToRawOrder();
  const assignMut = useAssignPartnerToRawOrder();

  useEffect(() => {
    if (!open) {
      setPartnerSlug('');
      setPreview(null);
      setPreviewError(null);
      setSubmitError(null);
    }
  }, [open, rawOrderId]);

  function handleCheck() {
    if (!partnerSlug) return;
    setPreview(null);
    setPreviewError(null);
    previewMut.mutate(
      { id: rawOrderId, partnerSlug },
      {
        onSuccess: (data) => setPreview(data as AssignPartnerToRawOrderPreview),
        onError: (err) => setPreviewError(err instanceof Error ? err.message : 'Failed to compute discount'),
      },
    );
  }

  function handleConfirm() {
    if (!preview || assignMut.isPending) return;
    setSubmitError(null);
    assignMut.mutate(
      { id: rawOrderId, partnerSlug: preview.partnerSlug },
      {
        onSuccess: (data) => {
          onAssigned(data as AssignPartnerToRawOrderResult);
          onClose();
        },
        onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Failed to assign partner'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign partner" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Use this when a guest actually booked through (or is staying at) a partner property but used the plain
          booking site, so no referral link was captured. The partner&rsquo;s discount / free delivery terms are
          applied to the quote, and commission is attributed to them once the booking is activated.
        </p>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Partner</span>
          <select
            className={SELECT_CLS}
            value={partnerSlug}
            onChange={(e) => { setPartnerSlug(e.target.value); setPreview(null); setPreviewError(null); }}
          >
            <option value="">Select a partner…</option>
            {activePartners.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
        </label>

        <button
          type="button"
          onClick={handleCheck}
          disabled={!partnerSlug || previewMut.isPending}
          className="w-full rounded-lg border border-teal-600 bg-white px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewMut.isPending ? 'Calculating…' : 'Calculate discount'}
        </button>

        {previewError && <p className="text-sm text-red-600">{previewError}</p>}

        {preview && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            {preview.discountCalculated ? (
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-gray-500">Rental discount</dt><dd className="font-medium">{formatCurrency(preview.rentalDiscount)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Free delivery waived</dt><dd className="font-medium">{formatCurrency(preview.deliveryDiscount)}</dd></div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5"><dt className="text-gray-600 font-medium">Total discount</dt><dd className="font-semibold">{formatCurrency(preview.totalDiscount)}</dd></div>
                {preview.currentQuote != null && preview.newQuote != null && (
                  <div className="flex justify-between"><dt className="text-gray-500">Web quote</dt><dd>{formatCurrency(preview.currentQuote)} → <span className="font-semibold">{formatCurrency(preview.newQuote)}</span></dd></div>
                )}
              </dl>
            ) : (
              <p className="text-amber-800">
                This booking doesn&rsquo;t have the vehicle and date details needed to price the partner discount
                automatically. The partner will still be attributed — apply any discount manually when activating.
              </p>
            )}
            <p className="text-gray-500">
              Delivery fees for eligible partner locations are waived automatically when you activate the booking.
            </p>
          </div>
        )}

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!preview || assignMut.isPending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assignMut.isPending ? 'Assigning…' : 'Confirm assignment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
