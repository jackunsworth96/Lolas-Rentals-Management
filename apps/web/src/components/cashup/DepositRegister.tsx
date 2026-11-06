import { useDepositRegister } from '../../api/cashup.js';
import { formatCurrency } from '../../utils/currency.js';
import { shortDate } from './CashupParts.js';

/**
 * Every open order currently holding a cash deposit. Staff tick each one
 * they find in the envelope, so a shortfall points at a specific booking
 * rather than a bare peso amount.
 */
export function DepositRegister({
  storeId,
  ticked,
  onToggle,
  onTickAll,
  envelopeCounted,
}: {
  storeId: string;
  ticked: string[];
  onToggle: (paymentId: string) => void;
  onTickAll: (paymentIds: string[]) => void;
  envelopeCounted: number;
}) {
  const { data, isLoading } = useDepositRegister(storeId);
  const entries = data?.entries ?? [];
  const tickedSet = new Set(ticked);
  const tickedTotal = entries.filter((e) => tickedSet.has(e.paymentId)).reduce((s, e) => s + e.amount, 0);
  const missing = entries.filter((e) => !tickedSet.has(e.paymentId));

  return (
    <div className="rounded-lg border border-cyan-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-100 px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Deposit register</h4>
          <p className="text-xs text-gray-500">
            Tick each deposit you can see in the envelope. Open orders hold {formatCurrency(data?.total ?? 0)} in cash deposits.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => onTickAll(entries.map((e) => e.paymentId))}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Tick all
          </button>
        )}
      </div>
      {isLoading ? (
        <p className="px-4 py-3 text-sm text-gray-400">Loading deposits…</p>
      ) : entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400">No open orders are holding a cash deposit.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {entries.map((e) => (
            <li key={e.paymentId}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={tickedSet.has(e.paymentId)}
                  onChange={() => onToggle(e.paymentId)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold text-gray-900">{e.bookingToken ?? e.orderId.slice(0, 8)}</span>
                    {e.customerName && <span className="ml-1.5 text-gray-600">{e.customerName}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.collectedOn && `Taken ${shortDate(e.collectedOn)}`}
                    {e.returnDue &&
                      ` · due back ${new Date(e.returnDue).toLocaleString('en-PH', {
                        timeZone: 'Asia/Manila',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-medium">{formatCurrency(e.amount)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <div className="space-y-1 border-t border-cyan-100 bg-cyan-50/50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Ticked deposits</span>
            <span className="tabular-nums font-semibold">{formatCurrency(tickedTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Envelope counted</span>
            <span className="tabular-nums font-semibold">{formatCurrency(envelopeCounted)}</span>
          </div>
          {missing.length > 0 && ticked.length > 0 && (
            <p className="pt-1 text-xs text-amber-800">
              Not ticked: {missing.map((m) => `${m.bookingToken ?? m.orderId.slice(0, 8)} (${formatCurrency(m.amount)})`).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
