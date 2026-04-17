import { usePaymentMethods } from '../../api/config.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import type { OrderPayment } from './useOrderDetail.js';

interface OrderDetailPaymentsTabProps {
  payments: OrderPayment[];
  totalPaid: number;
}

export function OrderDetailPaymentsTab({ payments, totalPaid }: OrderDetailPaymentsTabProps) {
  const { data: paymentMethods = [] } = usePaymentMethods() as {
    data: Array<{ id: string; name: string }> | undefined;
  };
  const pmLookup = new Map(paymentMethods.map((pm) => [pm.id, pm]));

  if (payments.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-charcoal-brand/60">No payments recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
            return (
              <tr key={idx} className={`border-b hover:bg-sand-brand ${isExt ? 'bg-amber-50' : ''}`}>
                <td className="py-2 pr-4">{formatDate(p.transactionDate)}</td>
                <td className="py-2 pr-4">
                  {isExt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Extension</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.settlementStatus === 'pending' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {p.settlementStatus === 'pending' ? 'Unpaid' : 'Paid'}
                      </span>
                    </span>
                  ) : (
                    <span className="capitalize">{p.paymentType ?? 'rental'}</span>
                  )}
                </td>
                <td className="py-2 pr-4 font-medium">{formatCurrency(p.amount)}</td>
                <td className="py-2 pr-4">{isExt && p.paymentMethodId === 'pending' ? '—' : (pmLookup.get(p.paymentMethodId)?.name ?? p.paymentMethodId)}</td>
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
    </div>
  );
}
