import { formatCurrency } from '../../utils/currency.js';
import type { OrderHistoryEvent } from './useOrderDetail.js';

interface OrderDetailHistoryTabProps {
  history: OrderHistoryEvent[];
}

export function OrderDetailHistoryTab({ history }: OrderDetailHistoryTabProps) {
  if (history.length === 0) {
    return (
      <div>
        <p className="text-sm text-charcoal-brand/60">No history events recorded.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative ml-4 border-l-2 border-gray-200 pl-6 space-y-0">
        {history.map((evt, idx) => {
          const iconColor =
            evt.type === 'extension' ? 'bg-orange-500' :
            evt.type === 'payment' ? 'bg-green-500' :
            evt.type === 'swap' ? 'bg-amber-500' :
            evt.type === 'addon' ? 'bg-purple-500' :
            evt.type === 'settled' ? 'bg-teal-brand' :
            evt.type === 'activated' ? 'bg-blue-500' :
            'bg-gray-400';

          return (
            <div key={idx} className="relative pb-6 last:pb-0">
              <div className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${iconColor}`} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{evt.description}</div>
                  {evt.detail && <div className="text-xs text-charcoal-brand/60">{evt.detail}</div>}
                </div>
                <div className="shrink-0 text-right">
                  {evt.amount != null && evt.amount > 0 && (
                    <div className="text-sm font-semibold text-green-600">{formatCurrency(evt.amount)}</div>
                  )}
                  <div className="text-xs text-gray-400">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleString('en-PH', {
                      timeZone: 'Asia/Manila',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
