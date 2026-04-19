import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import {
  moneyAmount,
  useTransferByOrderId,
  type TransferRow,
} from '../../api/transfers.js';
import { usePaymentMethods } from '../../api/config.js';
import { CollectTransferModal } from '../transfers/CollectTransferModal.js';
import { Badge } from '../common/Badge.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import type { OrderDetail } from './useOrderDetail.js';

interface OrderDetailTransferTabProps {
  order: OrderDetail;
  pushToast?: (msg: string, type: 'success' | 'error') => void;
}

const PAYMENT_STATUS_COLOR: Record<TransferRow['paymentStatus'], 'green' | 'yellow' | 'red'> = {
  Paid: 'green',
  'Partially Paid': 'yellow',
  Pending: 'red',
};

export function OrderDetailTransferTab({ order, pushToast }: OrderDetailTransferTabProps) {
  const qc = useQueryClient();
  const { data: transfer, isLoading } = useTransferByOrderId(order.id);

  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string }> | undefined;
  };
  const pmLookup = new Map(paymentMethods.map((pm) => [pm.id, pm]));

  const [collectOpen, setCollectOpen] = useState(false);

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
    return (
      <div className="py-8 text-center text-sm text-charcoal-brand/60">
        No airport transfer on this order.
      </div>
    );
  }

  const total = moneyAmount(transfer.totalPrice);
  const collected = transfer.collectedAmount ?? 0;
  const isCollected = !!transfer.collectedAt;

  return (
    <>
      <div className="space-y-5">
        {/* Header summary */}
        <div className="rounded-xl border border-charcoal-brand/10 bg-sand-brand p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-lato text-lg font-bold text-charcoal-brand">{transfer.route}</p>
              <p className="font-lato text-sm text-charcoal-brand/70">
                {formatDate(transfer.serviceDate)}
                {transfer.flightTime ? ` · ${transfer.flightTime}` : ''}
                {transfer.pickupTime ? ` · Pickup ${transfer.pickupTime}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-lato text-lg font-bold text-charcoal-brand">
                {formatCurrency(total)}
              </p>
              <Badge color={PAYMENT_STATUS_COLOR[transfer.paymentStatus] ?? 'gray'}>
                {transfer.paymentStatus}
              </Badge>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Van Type</p>
            <p className="font-medium text-charcoal-brand">{transfer.vanType ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Pax</p>
            <p className="font-medium text-charcoal-brand">{transfer.paxCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Service Date</p>
            <p className="font-medium text-charcoal-brand">{formatDate(transfer.serviceDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Pickup Time</p>
            <p className="font-medium text-charcoal-brand">{transfer.pickupTime ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Total Price</p>
            <p className="font-medium text-charcoal-brand">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-brand/50">Payment Status</p>
            <Badge color={PAYMENT_STATUS_COLOR[transfer.paymentStatus] ?? 'gray'}>
              {transfer.paymentStatus}
            </Badge>
          </div>
        </div>

        {/* Collection state */}
        {isCollected ? (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            <div className="text-sm">
              <p className="font-semibold text-green-800">Transfer payment collected</p>
              <p className="text-green-700">
                {formatCurrency(collected)}
                {transfer.collectedAt ? ` on ${formatDate(transfer.collectedAt.slice(0, 10))}` : ''}
                {transfer.paymentMethod
                  ? ` · ${pmLookup.get(transfer.paymentMethod)?.name ?? transfer.paymentMethod}`
                  : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm">
              <p className="font-semibold text-amber-900">Payment not yet collected</p>
              <p className="text-amber-800">
                Record the cash/GCash payment to close out this transfer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollectOpen(true)}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Collect Payment
            </button>
          </div>
        )}
      </div>

      {collectOpen && (
        <CollectTransferModal
          transfer={transfer}
          onClose={() => setCollectOpen(false)}
          onSuccess={(msg) => {
            pushToast?.(msg, 'success');
            void qc.invalidateQueries({ queryKey: ['transfers', 'by-order', order.id] });
          }}
        />
      )}
    </>
  );
}
