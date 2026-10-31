import { useState } from 'react';
import { useReleaseSurfRack, useSurfRackStock } from '../../api/surf-racks.js';
import { formatDateTime } from '../../utils/date.js';
import surfRackIcon from '../../assets/Home/Surf Rack Icon.svg';

interface Props {
  storeId: string;
  /** Mount-equipped bikes in this store, for context next to the rack count. */
  mountCount: number;
}

export function SurfRackStockCard({ storeId, mountCount }: Props) {
  const { data, isLoading } = useSurfRackStock(storeId);
  const release = useReleaseSurfRack();
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !data) return null;

  if (data.total <= 0) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <img src={surfRackIcon} className="h-5 w-5 shrink-0" alt="" />
        <span>
          Surf rack stock isn&apos;t tracked for this store yet, so customers see &quot;subject to availability&quot;.
          Set how many racks you own in Settings → Stores.
        </span>
      </div>
    );
  }

  const upcoming = data.allocations.filter((a) => new Date(a.startsAt).getTime() > Date.now());
  const out = data.allocations.filter((a) => new Date(a.startsAt).getTime() <= Date.now());

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src={surfRackIcon} className="h-5 w-5" alt="" />
          <h2 className="text-sm font-semibold text-gray-900">Surf racks</h2>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span><span className="font-semibold tabular-nums">{data.total}</span> owned</span>
          <span><span className="font-semibold tabular-nums text-blue-700">{data.outNow}</span> out now</span>
          <span>
            <span className={`font-semibold tabular-nums ${data.freeNow === 0 ? 'text-red-600' : 'text-green-700'}`}>{data.freeNow}</span> free now
          </span>
          <span className="text-gray-500">{upcoming.length} upcoming</span>
          <span className="text-gray-500">{mountCount} bikes with a rack mount</span>
        </div>
        {data.allocations.length > 0 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm text-blue-600 hover:underline">
            {expanded ? 'Hide bookings' : 'Show bookings'}
          </button>
        )}
      </div>

      {expanded && (
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-4">Booking</th>
              <th className="pb-2 pr-4">Customer</th>
              <th className="pb-2 pr-4">Bike</th>
              <th className="pb-2 pr-4">From</th>
              <th className="pb-2 pr-4">To</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {[...out, ...upcoming].map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{a.orderReference ?? a.orderId}</td>
                <td className="py-2 pr-4">{a.customerName ?? '—'}</td>
                <td className="py-2 pr-4">{a.vehicleName ?? <span className="text-amber-700">Not assigned</span>}</td>
                <td className="py-2 pr-4">{formatDateTime(a.startsAt)}</td>
                <td className="py-2 pr-4">{formatDateTime(a.endsAt)}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    disabled={release.isPending}
                    onClick={() => {
                      if (confirm('Mark this surf rack as returned? It becomes available for other bookings straight away. The price is not changed.')) {
                        release.mutate({ id: a.id, reason: 'returned_early' });
                      }
                    }}
                    className="text-xs font-medium text-teal-brand hover:underline disabled:opacity-50"
                  >
                    Mark returned
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {release.error && <p className="mt-2 text-sm text-red-600">{(release.error as Error).message}</p>}
    </div>
  );
}
