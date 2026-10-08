import { usePaymentMethods } from '../../api/config.js';
import { summarizeOrderPayments } from '@lolas/shared';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import { XenditRefundPanel } from './XenditRefundPanel.js';
import type { OrderPayment } from './useOrderDetail.js';

interface OrderDetailPaymentsTabProps {
  orderId: string;
  storeId: string;
  payments: OrderPayment[];
  totalPaid: number;
  securityDeposit: number;
}

export function OrderDetailPaymentsTab({ orderId, storeId, payments, totalPaid, securityDeposit }: OrderDetailPaymentsTabProps) {
  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string }> | undefined;
  };
  const pmLookup = new Map(paymentMethods.map((pm) => [pm.id, pm]));
  const summary = summarizeOrderPayments(payments);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-b border-gray-200 pb-4 text-sm sm:grid-cols-4">
        <div><dt className="text-gray-600">Rental paid</dt><dd className="font-semibold">{formatCurrency(summary.rentalPaid)}</dd></div>
        <div><dt className="text-gray-600">Deposit held</dt><dd className="font-semibold">{formatCurrency(summary.depositHeld)}</dd></div>
        <div><dt className="text-gray-600">Deposit due</dt><dd className="font-semibold">{formatCurrency(Math.max(0, securityDeposit - summary.depositCollected))}</dd></div>
        <div><dt className="text-gray-600">Deposit refunded</dt><dd className="font-semibold">{formatCurrency(summary.depositRefunded)}</dd></div>
      </dl>
      {payments.length === 0 ? <p className="text-sm text-charcoal-brand/60">No payments recorded.</p> : (
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-charcoal-brand/60">
            <th className="pb-2 pr-4">Date</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Amount</th>
            <th className="pb-2 pr-4">Method</th>
            <th className="pb-2">Ref</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, idx) => {
            const isExt = p.paymentType === 'extension';
            const isRefund = p.paymentType === 'refund' || p.paymentType === 'deposit_refund';
            const isReturnCharge = p.paymentType === 'return_charge';
            const isAddonIou = p.paymentType === 'addon' && ['pending', 'xendit'].includes(p.paymentMethodId)
              && (p.settlementStatus === 'pending' || p.settlementStatus === 'absorbed');
            return (
              <tr key={idx} className={`border-b hover:bg-sand-brand ${isExt ? 'bg-amber-50' : ''} ${isRefund ? 'bg-red-50' : ''}`}>
                <td className="py-2 pr-4">{formatDate(p.transactionDate)}</td>
                <td className="py-2 pr-4">
                  {isReturnCharge ? (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">Return charge</span>
                  ) : isRefund ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      {p.paymentType === 'deposit_refund' ? 'Deposit refund' : 'Rental refund'}
                    </span>
                  ) : p.paymentType === 'deposit_applied' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Deposit applied to charge</span>
                  ) : isExt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Extension</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.settlementStatus === 'pending' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {p.settlementStatus === 'pending' ? 'Unpaid' : 'Paid'}
                      </span>
                    </span>
                  ) : isAddonIou ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="capitalize">{p.paymentType}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.settlementStatus === 'absorbed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.settlementStatus === 'absorbed' ? 'Included in card payment' : 'Unpaid'}
                      </span>
                    </span>
                  ) : (
                    <span className="capitalize">{p.paymentType ?? 'rental'}</span>
                  )}
                </td>
                <td className={`py-2 pr-4 font-medium ${isRefund ? 'text-red-700' : ''}`}>
                  {isRefund ? `−${formatCurrency(p.amount)}` : formatCurrency(p.amount)}
                </td>
                <td className="py-2 pr-4">{isAddonIou
                  ? p.settlementStatus === 'absorbed' ? 'Covered by card payment' : 'Awaiting card payment'
                  : isExt && p.paymentMethodId === 'pending' ? '—' : (pmLookup.get(p.paymentMethodId)?.name ?? p.paymentMethodId)}</td>
                <td className="py-2 text-charcoal-brand/60">{p.settlementRef ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="py-2 pr-4" colSpan={2}>Total Paid</td>
            <td className="py-2 pr-4">{formatCurrency(totalPaid)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
      )}
      <XenditRefundPanel orderId={orderId} storeId={storeId} payments={payments} />
    </div>
  );
}
