import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatVanType, useTransferByOrderId, type TransferCollector } from '../../api/transfers.js';
import { usePaymentMethods } from '../../api/config.js';
import { ReceivePaymentModal } from '../transfers/ReceivePaymentModal.js';
import {
  flightTimeLabel,
  isCancelled,
  isSettled,
  moneyState,
  MONEY_TONE_CLASSES,
  pickupWindow,
  serviceDateLabel,
  transferCut,
  transferDue,
  transferTotal,
} from '../transfers/transfer-state.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate, manilaToday } from '../../utils/date.js';
import type { OrderDetail } from './useOrderDetail.js';

interface OrderDetailTransferTabProps {
  order: OrderDetail;
  pushToast?: (msg: string, type: 'success' | 'error') => void;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">{label}</p>
      <p className="font-medium text-charcoal-brand tabular-nums">{children}</p>
    </div>
  );
}

export function OrderDetailTransferTab({ order, pushToast }: OrderDetailTransferTabProps) {
  const { data: transfer, isLoading } = useTransferByOrderId(order.id);
  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string }> | undefined;
  };
  const [collector, setCollector] = useState<TransferCollector | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-charcoal-brand/10" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-charcoal-brand/5" />
        <div className="h-10 w-36 animate-pulse rounded bg-charcoal-brand/10" />
      </div>
    );
  }

  if (!transfer) {
    return <div className="py-8 text-center text-sm text-charcoal-brand/60">No airport transfer on this order.</div>;
  }

  const today = manilaToday();
  const total = transferTotal(transfer);
  const due = transferDue(transfer);
  const state = moneyState(transfer);
  const methodName = transfer.paymentMethod
    ? paymentMethods.find((pm) => pm.id === transfer.paymentMethod)?.name ?? transfer.paymentMethod
    : null;
  const flight = flightTimeLabel(transfer.flightTime);
  const pickup = pickupWindow(transfer);
  const open = !isCancelled(transfer) && !isSettled(transfer);

  return (
    <>
      <div className="space-y-5">
        <div className="rounded-xl border border-charcoal-brand/10 bg-sand-brand p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-lato text-lg font-bold text-charcoal-brand">{transfer.route}</p>
              <p className="font-lato text-sm text-charcoal-brand/70 tabular-nums">
                {serviceDateLabel(transfer.serviceDate, today)}
                {flight ? ` · Flight ${flight}` : ''}
                {pickup ? ` · Pickup ${pickup}` : ''}
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-lato text-lg font-bold text-charcoal-brand">{formatCurrency(total)}</p>
              <span
                title={state.hint}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${MONEY_TONE_CLASSES[state.tone]}`}
              >
                {state.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Detail label="Vehicle">{formatVanType(transfer.vanType)}</Detail>
          <Detail label="Pax">{transfer.paxCount}</Detail>
          <Detail label="Date">{formatDate(transfer.serviceDate)}</Detail>
          <Detail label="Accommodation">{transfer.accommodation ?? '—'}</Detail>
          <Detail label="Driver cut">{formatCurrency(transferCut(transfer))}</Detail>
          <Detail label="Billing">{transfer.billedToOrder ? 'Part of this order' : 'Paid separately'}</Detail>
        </div>

        {due <= 0 || !open ? (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            <div className="text-sm">
              <p className="font-semibold text-green-800">
                {isCancelled(transfer)
                  ? 'Transfer cancelled'
                  : transfer.driverCollectedAmount > 0
                    ? 'Driver collected the fare'
                    : 'Transfer fare paid'}
              </p>
              <p className="text-green-700 tabular-nums">
                {formatCurrency(transfer.amountPaid)}
                {transfer.collectedAt ? ` on ${formatDate(transfer.collectedAt.slice(0, 10))}` : ''}
                {methodName ? ` · ${methodName}` : ''}
                {transfer.driverSettledAt ? ' · settled with driver' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm">
              <p className="font-semibold text-amber-900 tabular-nums">{formatCurrency(due)} still to collect</p>
              <p className="text-pretty text-amber-800">
                {transfer.billedToOrder
                  ? 'Included in the order balance — collecting here also pays the order.'
                  : transfer.collectVia === 'driver'
                    ? 'The driver is collecting this from the customer.'
                    : 'Collect at delivery, pickup or return.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCollector('driver')}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                Driver collected
              </button>
              <button
                type="button"
                onClick={() => setCollector('lolas')}
                className="rounded-lg bg-teal-brand px-3 py-2 text-sm font-medium text-white hover:bg-teal-brand/90"
              >
                Received at shop
              </button>
            </div>
          </div>
        )}
      </div>

      {collector && (
        <ReceivePaymentModal
          transfer={transfer}
          initialCollector={collector}
          onClose={() => setCollector(null)}
          onSuccess={(msg) => pushToast?.(msg, 'success')}
        />
      )}
    </>
  );
}
