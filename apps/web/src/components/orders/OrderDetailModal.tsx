import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../common/Modal.js';
import type { EnrichedOrder } from '../../types/api.js';
import { useToast } from '../../hooks/useToast.js';
import { usePaymentMethods } from '../../api/config.js';
import { useOrderDetail } from './useOrderDetail.js';
import { OrderDetailSummaryTab } from './OrderDetailSummaryTab.js';
import { OrderDetailPaymentsTab } from './OrderDetailPaymentsTab.js';
import { OrderDetailVehiclesTab } from './OrderDetailVehiclesTab.js';
import { OrderDetailAddonsTab } from './OrderDetailAddonsTab.js';
import { OrderDetailHistoryTab } from './OrderDetailHistoryTab.js';
import { OrderDetailTransferTab } from './OrderDetailTransferTab.js';
import { OrderDetailExtensionsTab } from './OrderDetailExtensionsTab.js';
import { AccidentReportModal } from '../accidents/AccidentReportModal.js';
import { CancelActivatedOrderModal } from './CancelActivatedOrderModal.js';
import { useAuthStore } from '../../stores/auth-store.js';

function moneyAmount(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'object' && 'amount' in val && typeof (val as { amount: number }).amount === 'number') return (val as { amount: number }).amount;
  return Number(val) || 0;
}

interface OrderDetailModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  storeId: string;
  readOnly?: boolean;
  enrichedData?: EnrichedOrder;
  onCancelled?: () => void;
}

type TabKey = 'summary' | 'payments' | 'vehicles' | 'addons' | 'extensions' | 'transfer' | 'history';

export function OrderDetailModal({ open, onClose, orderId, storeId, readOnly = false, enrichedData, onCancelled }: OrderDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('summary');
  const [accidentReportOpen, setAccidentReportOpen] = useState(false);
  const [cancelBookingOpen, setCancelBookingOpen] = useState(false);
  const canCancelOrders = useAuthStore((state) => state.hasPermission('can_cancel_orders'));
  const { toasts, pushToast } = useToast();
  const { order, loading, items, payments, orderAddons, swaps, history, helmetSwaps } = useOrderDetail(orderId);
  const { data: paymentMethods = [] } = usePaymentMethods() as { data: Array<{ id: string; name: string }> | undefined };

  if (!open) return null;
  if (loading || !order) {
    return (
      <Modal open onClose={onClose} title="Order" size="lg">
        <div className="py-8 text-center text-charcoal-brand/60">Loading order...</div>
      </Modal>
    );
  }

  const customerName = enrichedData?.customerName ?? order.customerId ?? '—';
  const orderStatusStr = String((order.status as { value?: string } | undefined)?.value ?? order.status ?? '');
  const isActive = orderStatusStr === 'active';
  const canAct = isActive && !readOnly;
  const canCancel = !readOnly && canCancelOrders && (isActive || orderStatusStr === 'confirmed');

  const total = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
  const totalPaid = enrichedData?.totalPaid ?? payments.reduce((s, p) => {
    if (p.paymentType === 'deposit') return s;
    if (p.paymentType === 'extension' && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed')) return s;
    if (p.paymentType === 'addon' && p.paymentMethodId === 'pending' && p.settlementStatus === 'pending') return s;
    if (p.paymentType === 'refund') return s - (p.amount ?? 0);
    return s + (p.amount ?? 0);
  }, 0);

  const extensionCount = payments.filter((p) => p.paymentType === 'extension').length;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'payments', label: `Payments (${payments.length})` },
    { key: 'vehicles', label: `Vehicles (${items.length})` },
    { key: 'addons', label: `Add-ons (${orderAddons.length})` },
    { key: 'extensions', label: `Extensions (${extensionCount})` },
    { key: 'transfer', label: 'Transfer' },
    { key: 'history', label: 'History' },
  ];

  return (
    <>
      <Modal open onClose={onClose} title={`Order — ${customerName}`} size="xl">
        <div className="mb-4 flex items-center gap-2 border-b border-gray-200">
          <div className="flex flex-1 gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-teal-brand text-teal-brand' : 'border-transparent text-charcoal-brand/60 hover:text-charcoal-brand'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {(canAct || canCancel) && (
            <div className="mb-1 flex shrink-0 items-center gap-2">
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setCancelBookingOpen(true)}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Cancel booking
                </button>
              )}
              {canAct && (
                <button
                  type="button"
                  onClick={() => setAccidentReportOpen(true)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  🚨 Report Accident
                </button>
              )}
            </div>
          )}
        </div>

        {tab === 'summary' && (
          <OrderDetailSummaryTab
            orderId={orderId}
            storeId={storeId}
            readOnly={readOnly}
            enrichedData={enrichedData}
            order={order}
            items={items}
            payments={payments}
            orderAddons={orderAddons}
            helmetSwaps={helmetSwaps}
            canAct={canAct}
            onClose={onClose}
            pushToast={pushToast}
          />
        )}

        {tab === 'payments' && (
          <OrderDetailPaymentsTab payments={payments} totalPaid={totalPaid} />
        )}

        {tab === 'vehicles' && (
          <OrderDetailVehiclesTab
            orderId={orderId}
            items={items}
            swaps={swaps}
            helmetSwaps={helmetSwaps}
            canAct={canAct}
          />
        )}

        {tab === 'addons' && (
          <OrderDetailAddonsTab
            orderId={orderId}
            storeId={storeId}
            orderAddons={orderAddons}
            items={items}
            canAct={canAct}
          />
        )}

        {tab === 'extensions' && (
          <OrderDetailExtensionsTab history={history} payments={payments} paymentMethods={paymentMethods} />
        )}

        {tab === 'transfer' && (
          <OrderDetailTransferTab order={order} pushToast={pushToast} />
        )}

        {tab === 'history' && (
          <OrderDetailHistoryTab history={history} />
        )}
      </Modal>

      {open &&
        toasts.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed bottom-8 left-4 right-4 z-[calc(9999)] flex flex-col-reverse items-stretch gap-2 md:left-auto md:right-8 md:items-end">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
                  t.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'
                }`}
              >
                {t.msg}
              </div>
            ))}
          </div>,
          document.body,
        )}

      {accidentReportOpen && (
        <AccidentReportModal
          open
          onClose={() => setAccidentReportOpen(false)}
          prefillOrder={items[0] ? {
            orderId,
            orderReference: (order.bookingToken ?? order.booking_token ?? '') as string,
            vehicleId: items[0].vehicleId,
            vehicleName: items[0].vehicleName,
            customerId: (order.customerId ?? null) as string | null,
            customerName: customerName,
            peaceOfMindActive: orderAddons.some((a) => a.addonName.toLowerCase().includes('peace')),
          } : undefined}
          onSuccess={() => setAccidentReportOpen(false)}
        />
      )}

      {cancelBookingOpen && (
        <CancelActivatedOrderModal
          open
          onClose={() => setCancelBookingOpen(false)}
          orderId={orderId}
          orderReference={(order.bookingToken ?? order.booking_token ?? orderId) as string}
          customerName={customerName}
          vehicleNames={items.map((item) => item.vehicleName).filter(Boolean).join(', ') || 'No assigned vehicle'}
          recordedPaymentTotal={totalPaid}
          onCancelled={() => {
            onClose();
            onCancelled?.();
          }}
        />
      )}
    </>
  );
}

export default OrderDetailModal;
