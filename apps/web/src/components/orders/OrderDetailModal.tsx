import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../common/Modal.js';
import type { EnrichedOrder } from '../../types/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useOrderDetail } from './useOrderDetail.js';
import { OrderDetailSummaryTab } from './OrderDetailSummaryTab.js';
import { OrderDetailPaymentsTab } from './OrderDetailPaymentsTab.js';
import { OrderDetailVehiclesTab } from './OrderDetailVehiclesTab.js';
import { OrderDetailAddonsTab } from './OrderDetailAddonsTab.js';
import { OrderDetailHistoryTab } from './OrderDetailHistoryTab.js';

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
}

type TabKey = 'summary' | 'payments' | 'vehicles' | 'addons' | 'history';

export function OrderDetailModal({ open, onClose, orderId, storeId, readOnly = false, enrichedData }: OrderDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('summary');
  const { toasts, pushToast } = useToast();
  const { order, loading, items, payments, orderAddons, swaps, history } = useOrderDetail(orderId);

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

  const total = enrichedData?.finalTotal ?? moneyAmount(order.finalTotal);
  const totalPaid = enrichedData?.totalPaid ?? payments.reduce((s, p) => s + (p.amount ?? 0), 0);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'payments', label: `Payments (${payments.length})` },
    { key: 'vehicles', label: `Vehicles (${items.length})` },
    { key: 'addons', label: `Add-ons (${orderAddons.length})` },
    { key: 'history', label: 'History' },
  ];

  return (
    <>
      <Modal open onClose={onClose} title={`Order — ${customerName}`} size="xl">
        <div className="mb-4 flex gap-2 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-teal-brand text-teal-brand' : 'border-transparent text-charcoal-brand/60 hover:text-charcoal-brand'}`}
            >
              {t.label}
            </button>
          ))}
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
    </>
  );
}

export default OrderDetailModal;
