import { useAuthStore } from '../../stores/auth-store.js';
import { useRateHistory, useDeleteRateHistory } from '../../api/payroll.js';
import { formatCurrency } from '../../utils/currency.js';

/** Pay rates over time. Payroll prices each day with the rate in effect on that day. */
export function RateHistory({ employeeId }: { employeeId: string }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('can_view_payroll');
  const canDelete = hasPermission('can_run_payroll');
  const { data: rows = [], isLoading } = useRateHistory(canView ? employeeId : '');
  const remove = useDeleteRateHistory();

  if (!canView || !employeeId) return null;

  return (
    <div className="mt-6">
      <h4 className="mb-2 text-sm font-semibold text-gray-900">Rate history</h4>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No rate history yet. It starts when the rates are next saved.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">From</th>
                <th className="px-3 py-2 text-right">Basic</th>
                <th className="px-3 py-2 text-right">OT / h</th>
                <th className="px-3 py-2 text-right">9pm</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-left">Note</th>
                {canDelete && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.isCurrent ? 'bg-teal-50/50' : r.isFuture ? 'bg-blue-50/40' : ''}>
                  <td className="px-3 py-2 tabular-nums text-gray-900">
                    {r.effectiveFrom}
                    {r.isCurrent && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">Current</span>}
                    {r.isFuture && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">Upcoming</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(r.basicRate)}
                    <span className="text-xs text-gray-400">/{['monthly', 'fixed'].includes((r.rateType ?? 'daily').toLowerCase()) ? 'mo' : 'day'}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.overtimeRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.ninePmBonusRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.commissionRate}%</td>
                  <td className="px-3 py-2 text-gray-600">{r.note ?? ''}</td>
                  {canDelete && (
                    <td className="px-3 py-2 text-right">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => { if (window.confirm(`Remove the rate effective ${r.effectiveFrom}?`)) remove.mutate(r.id); }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {remove.error && <p className="mt-1 text-sm text-red-600">{(remove.error as Error).message}</p>}
    </div>
  );
}
