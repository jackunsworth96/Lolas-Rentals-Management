import { Modal } from '../common/Modal.js';
import { useRevenueTransactions } from '../../api/dashboard.js';
import { formatPeso } from './ui/index.js';

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

export function RevenueTransactionsModal({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string | undefined }) {
  const { data, isLoading, error } = useRevenueTransactions(storeId, open);
  const transactions = data?.transactions ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Revenue today" size="lg">
      <p className="-mt-1 mb-4 text-sm text-gray-500">
        Every payment and misc sale counted in today&apos;s revenue. Security deposits and refunds are not included.
      </p>
      {isLoading && <div className="h-24 animate-pulse rounded-lg bg-gray-100" />}
      {error && <p className="text-sm text-red-600">Couldn&apos;t load transactions: {(error as Error).message}</p>}
      {!isLoading && !error && transactions.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No payments recorded yet today</p>
      )}
      {transactions.length > 0 && (
        <>
          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">What</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((t) => (
                  <tr key={t.key}>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-600">{timeOf(t.time)}</td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {t.label}
                      {t.kind === 'misc_sale' && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">Misc sale</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {t.customerName ?? '—'}
                      {t.reference && <span className="block text-xs text-gray-400">#{t.reference}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{t.method ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${t.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatPeso(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-teal-brand/5 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">
              Total ({transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'})
            </span>
            <span className="text-lg font-bold tabular-nums text-teal-brand">{formatPeso(data!.total)}</span>
          </div>
        </>
      )}
    </Modal>
  );
}
