import { useOrderLookup } from '../../api/cashup.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatTime } from '../../utils/date.js';
import { shortDate } from './CashupParts.js';

/**
 * Cross-day trail for an order: every payment, deposit and return, which
 * cash-up day it landed on, and whether it was posted after that day locked.
 */
export function OrderLookupPanel({
  storeId,
  query,
  onSelectDate,
}: {
  storeId: string;
  query: string;
  onSelectDate: (date: string) => void;
}) {
  const term = query.trim();
  const { data = [], isFetching } = useOrderLookup(storeId, term);
  if (term.length < 3) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-900">
        Order trail {isFetching && <span className="font-normal normal-case text-blue-700">· searching…</span>}
      </p>
      {data.length === 0 && !isFetching && (
        <p className="text-sm text-gray-500">No orders at this store match “{term}”.</p>
      )}
      <div className="space-y-3">
        {data.map((o) => (
          <div key={o.orderId} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2">
              <p className="text-sm">
                <span className="font-semibold text-gray-900">{o.bookingToken ?? o.orderId.slice(0, 8)}</span>
                {o.customerName && <span className="ml-1.5 text-gray-600">{o.customerName}</span>}
              </p>
              <p className="text-xs text-gray-500">
                {o.status}
                {o.orderDate && ` · booked ${shortDate(o.orderDate)}`}
                {o.settledAt && ` · settled ${new Date(o.settledAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}`}
              </p>
            </div>
            <ul>
              {o.entries.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No payments recorded.</li>}
              {o.entries.map((e, i) => (
                <li key={`${e.kind}-${e.createdAt}-${i}`} className="flex items-center justify-between gap-3 border-b border-gray-50 px-3 py-1.5 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <span className="capitalize text-gray-800">{e.kind.replace(/_/g, ' ')}</span>
                    <span className="ml-1.5 text-xs text-gray-500">{e.method}</span>
                    {e.postedAfterLock && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        after cash-up locked
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {e.date && (
                      <button
                        type="button"
                        onClick={() => onSelectDate(e.date!)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                        title={`Cash-up ${e.cashupStatus}`}
                      >
                        {shortDate(e.date)}
                        {e.createdAt && ` ${formatTime(e.createdAt)}`}
                      </button>
                    )}
                    <span className="tabular-nums font-medium text-gray-900">{formatCurrency(e.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
