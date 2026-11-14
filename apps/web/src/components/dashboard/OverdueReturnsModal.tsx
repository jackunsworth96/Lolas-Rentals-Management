import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Phone, Wallet } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { useOverdueReturns } from '../../api/dashboard.js';
import { DashboardOrderModal } from './TodayMovements.js';
import { formatPeso } from './ui/index.js';

function overdueFor(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min overdue`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m overdue`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} overdue`;
}

function dueLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OverdueReturnsModal({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string | undefined }) {
  const { data = [], isLoading, error } = useOverdueReturns(storeId, open);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  return (
    <>
      <Modal open={open} onClose={onClose} title="Overdue returns" size="lg">
        <p className="-mt-1 mb-4 text-sm text-gray-500">Tap an order to settle it or change the booking.</p>
        {isLoading && <div className="h-24 animate-pulse rounded-lg bg-gray-100" />}
        {error && <p className="text-sm text-red-600">Couldn&apos;t load overdue returns: {(error as Error).message}</p>}
        {!isLoading && !error && data.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">Nothing overdue. Everything is back on time.</p>
        )}
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {data.map((o) => (
            <li key={o.orderId}>
              <button
                type="button"
                onClick={() => setSelected({ id: o.orderId, storeId: o.storeId })}
                className="block w-full rounded-xl border border-red-200 bg-red-50/40 p-3 text-left transition hover:border-red-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{o.customerName}</p>
                    {o.reference && <p className="truncate text-xs text-gray-400">#{o.reference}</p>}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    <AlertOctagon className="h-3 w-3" />
                    {overdueFor(o.dueAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {o.vehicles.join(', ')}
                  <span className="text-gray-400"> · was due {dueLabel(o.dueAt)}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {o.balanceDue > 0 ? (
                    <span className="font-semibold text-red-600">
                      <Wallet className="mr-1 inline h-3 w-3" />
                      {formatPeso(o.balanceDue)} to collect
                    </span>
                  ) : (
                    <span className="text-green-700">Paid in full</span>
                  )}
                  {o.deposit > 0 && <span className="text-gray-600">Deposit to refund {formatPeso(o.deposit)}</span>}
                  {o.mobile && (
                    <span className="text-gray-500">
                      <Phone className="mr-1 inline h-3 w-3" />
                      {o.mobile}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      {selected && (
        <DashboardOrderModal
          orderId={selected.id}
          storeId={selected.storeId}
          readOnly={false}
          onClose={() => {
            setSelected(null);
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </>
  );
}
