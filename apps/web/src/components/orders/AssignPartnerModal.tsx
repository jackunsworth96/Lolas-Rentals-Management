import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal.js';
import { usePartners } from '../../api/partners.js';
import { usePreviewAssignPartner, useAssignPartnerToOrder, type AssignPartnerPreview } from '../../api/orders.js';
import { usePaymentMethods, useChartOfAccounts } from '../../api/config.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  storeId: string;
  onAssigned: (message: string) => void;
}

const SELECT_CLS = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

/**
 * Lets staff retroactively attribute an already-activated order to a partner
 * when the guest actually booked at (or was referred by) a partner property
 * but came in through the plain booking site, so no `?ref=` link was ever
 * captured. Only usable while the order has no partner yet (never
 * reassigns/overwrites existing attribution) — see
 * apps/api/src/use-cases/orders/assign-partner-to-order.ts.
 *
 * Mirrors the discount/free-delivery terms the guest would have received had
 * the link been used at booking time, and nets the rental discount out of
 * both final_total and orders_raw.rental_value_raw so partner commission is
 * computed on the same, now-discounted figure going forward. If the guest
 * already paid more than the new discounted total, a real cash refund for
 * the excess must be recorded in the same action.
 */
export function AssignPartnerModal({ open, onClose, orderId, storeId, onAssigned }: Props) {
  const { data: partnersRaw } = usePartners(storeId);
  const partners = (partnersRaw ?? []) as Array<{ id: string; slug: string; name: string; active: boolean; status: string }>;
  const activePartners = partners.filter((p) => p.active && p.status === 'active');

  const [partnerSlug, setPartnerSlug] = useState('');
  const [preview, setPreview] = useState<AssignPartnerPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refundMethodId, setRefundMethodId] = useState('');
  const [refundAccountId, setRefundAccountId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewMut = usePreviewAssignPartner();
  const assignMut = useAssignPartnerToOrder();
  const routing = usePaymentRouting();

  const { data: paymentMethodsRaw } = usePaymentMethods();
  const paymentMethods = (paymentMethodsRaw ?? []) as Array<{ id: string; name: string; isActive?: boolean; is_active?: boolean }>;
  const activePaymentMethods = paymentMethods.filter((m) => m.isActive !== false && m.is_active !== false);

  const { data: storeAccountsRaw } = useChartOfAccounts();
  const storeAccounts = (storeAccountsRaw ?? []) as Array<{ id: string; name: string; accountType?: string; account_type?: string }>;

  const defaultReceivableId = (() => {
    const match = storeAccounts.find((a) => {
      const type = String(a.accountType ?? a.account_type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      return type === 'asset' && name.includes('receivable');
    });
    if (match) return String(match.id);
    const anyAsset = storeAccounts.find((a) => String(a.accountType ?? a.account_type ?? '').toLowerCase() === 'asset');
    return anyAsset ? String(anyAsset.id) : '';
  })();

  const pmLookup = new Map(activePaymentMethods.map((pm) => [pm.id, pm]));
  const selectedRefundPM = refundMethodId ? pmLookup.get(refundMethodId) : null;
  const routedRefundAcct = refundMethodId
    ? routing.resolveReceivedIntoForStore(storeId, refundMethodId, selectedRefundPM?.name ?? null)
    : null;

  useEffect(() => {
    if (routedRefundAcct) setRefundAccountId(routedRefundAcct);
    else setRefundAccountId('');
  }, [routedRefundAcct]);

  useEffect(() => {
    if (!open) {
      setPartnerSlug('');
      setPreview(null);
      setPreviewError(null);
      setRefundMethodId('');
      setRefundAccountId('');
      setSubmitError(null);
    }
  }, [open, orderId]);

  function handleCheck() {
    if (!partnerSlug) return;
    setPreview(null);
    setPreviewError(null);
    previewMut.mutate(
      { id: orderId, partnerSlug },
      {
        onSuccess: (data) => setPreview(data as AssignPartnerPreview),
        onError: (err) => setPreviewError(err instanceof Error ? err.message : 'Failed to compute discount'),
      },
    );
  }

  const needsRefund = (preview?.overpaidAmount ?? 0) > 0;
  const canConfirm = !!preview && !assignMut.isPending && (!needsRefund || (!!refundMethodId && !!refundAccountId && !!defaultReceivableId));

  function handleConfirm() {
    if (!preview || !canConfirm) return;
    setSubmitError(null);
    assignMut.mutate(
      {
        id: orderId,
        partnerSlug: preview.partnerSlug,
        ...(needsRefund
          ? {
              refund: {
                refundMethodId,
                refundAccountId,
                receivableAccountId: defaultReceivableId,
                reason: `Retroactive partner assignment (${preview.partnerName}) — discount overpayment refund`,
              },
            }
          : {}),
      },
      {
        onSuccess: () => {
          onAssigned(
            needsRefund
              ? `${preview.partnerName} assigned. ${formatCurrency(preview.totalDiscount)} discount applied, ${formatCurrency(preview.overpaidAmount)} refunded.`
              : `${preview.partnerName} assigned. ${formatCurrency(preview.totalDiscount)} discount applied.`,
          );
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
          Use this when a guest actually booked through (or stayed at) a partner property but used the plain
          booking site, so no referral link was ever captured. This applies the partner&rsquo;s discount / free
          delivery terms retroactively and attributes commission to them going forward.
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
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-gray-500">Rental discount</dt><dd className="font-medium">{formatCurrency(preview.rentalDiscount)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Free delivery waived</dt><dd className="font-medium">{formatCurrency(preview.deliveryDiscount)}</dd></div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5"><dt className="text-gray-600 font-medium">Total discount</dt><dd className="font-semibold">{formatCurrency(preview.totalDiscount)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Order total</dt><dd>{formatCurrency(preview.currentFinalTotal)} → <span className="font-semibold">{formatCurrency(preview.newFinalTotal)}</span></dd></div>
            </dl>

            {needsRefund ? (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-amber-800">
                  The guest already paid {formatCurrency(preview.totalPaid)} — more than the new, discounted total.{' '}
                  <strong>{formatCurrency(preview.overpaidAmount)} must be refunded</strong> to complete this assignment.
                </p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Refund method</span>
                  <select
                    className={SELECT_CLS}
                    value={refundMethodId}
                    onChange={(e) => setRefundMethodId(e.target.value)}
                  >
                    <option value="">Select method…</option>
                    {activePaymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                {refundMethodId && !refundAccountId && (
                  <p className="text-xs text-red-600">No account is routed for this payment method — pick a different method or configure payment routing first.</p>
                )}
                {!defaultReceivableId && (
                  <p className="text-xs text-red-600">No receivable (Asset) account configured for this store.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-green-700">No refund needed — the lower total only reduces what&rsquo;s still outstanding.</p>
            )}
          </div>
        )}

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assignMut.isPending ? 'Assigning…' : 'Confirm assignment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
