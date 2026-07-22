import { useEffect, useMemo, useState } from 'react';
import { usePartners } from '../../api/partners.js';
import { useSetOrderPartner } from '../../api/orders.js';
import { Modal } from '../common/Modal.js';
import { activePartnerChoices, attributionAction, currentPartnerChoice } from './partner-attribution.js';

interface PartnerAttributionModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderReference: string;
  customerName: string;
  storeId: string;
  currentPartnerRef: string | null;
  onSaved?: () => void;
}

export function PartnerAttributionModal({
  open,
  onClose,
  orderId,
  orderReference,
  customerName,
  storeId,
  currentPartnerRef,
  onSaved,
}: PartnerAttributionModalProps) {
  const { data: partners = [], isLoading } = usePartners(storeId);
  const activePartners = useMemo(
    () => activePartnerChoices(partners),
    [partners],
  );
  const currentPartner = currentPartnerChoice(partners, currentPartnerRef);
  const originalPartnerId = currentPartner?.id ?? (currentPartnerRef ? `current:${currentPartnerRef}` : '');
  const [partnerId, setPartnerId] = useState('');
  const mutation = useSetOrderPartner();

  useEffect(() => {
    if (open) {
      setPartnerId(originalPartnerId);
      mutation.reset();
    }
    // Reset only when the modal target changes or opens. Including the mutation
    // object would reset an in-flight request on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, originalPartnerId]);

  const action = attributionAction(originalPartnerId, partnerId);
  const changed = action !== 'unchanged';
  const selectedPartner = activePartners.find((partner) => partner.id === partnerId);
  const isRemoval = action === 'remove';

  async function save() {
    if (!changed || mutation.isPending) return;
    try {
      await mutation.mutateAsync({ id: orderId, partnerId: partnerId || null });
      onSaved?.();
      onClose();
    } catch {
      // The mutation error is rendered below.
    }
  }

  const actionLabel = isRemoval
    ? 'Confirm removal'
    : action === 'reassign'
      ? 'Confirm reassignment'
      : 'Confirm assignment';

  return (
    <Modal open={open} onClose={mutation.isPending ? () => undefined : onClose} title="Affiliate partner" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <p className="font-medium text-gray-900">{customerName}</p>
          <p className="text-xs text-gray-500">Order {orderReference}</p>
        </div>

        <div>
          <label htmlFor="order-partner" className="mb-1 block text-sm font-medium text-gray-700">
            Partner
          </label>
          <select
            id="order-partner"
            value={partnerId}
            onChange={(event) => setPartnerId(event.target.value)}
            disabled={isLoading || mutation.isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">No partner</option>
            {currentPartner && !activePartners.some((partner) => partner.id === currentPartner.id) && (
              <option value={currentPartner.id} disabled>{currentPartner.name} (inactive — current)</option>
            )}
            {currentPartnerRef && !currentPartner && (
              <option value={originalPartnerId} disabled>{currentPartnerRef} (unavailable — current)</option>
            )}
            {activePartners.map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.name}</option>
            ))}
          </select>
          {currentPartnerRef && !currentPartner && (
            <p className="mt-1 text-xs text-amber-700">
              The current partner ({currentPartnerRef}) is no longer available; choose an active partner or remove it.
            </p>
          )}
        </div>

        {changed && (
          <div className={`rounded-lg border px-3 py-2 text-sm ${isRemoval ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {isRemoval
              ? `This booking will be removed from ${currentPartner?.name ?? currentPartnerRef}'s portal report.`
              : `This booking will appear in ${selectedPartner?.name ?? 'the selected partner'}'s portal report. Normal commission rules will still apply.`}
          </div>
        )}

        {mutation.error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {mutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!changed || mutation.isPending || isLoading || (!isRemoval && !selectedPartner)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${isRemoval ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {mutation.isPending ? 'Saving…' : actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
