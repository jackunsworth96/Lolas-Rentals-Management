import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import {
  useAvailabilityDetail,
  useRecordTurnedAway,
  type AvailabilityModelRow,
} from '../../api/dashboard-availability.js';
import { useSurfRackAvailability } from '../../api/surf-racks.js';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
  date?: string;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function dateLabelFor(isoDate: string | undefined): string {
  if (!isoDate) return todayLabel();
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDropoffTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TurnedAwayButton({ storeId, modelId }: { storeId: string; modelId: string }) {
  const record = useRecordTurnedAway();
  const [logged, setLogged] = useState(0);

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={record.isPending}
        onClick={() =>
          record.mutate({ storeId, vehicleModelId: modelId }, { onSuccess: () => setLogged((n) => n + 1) })
        }
        className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {record.isPending ? 'Saving…' : 'Customer turned away'}
      </button>
      {logged > 0 && <span className="text-xs text-green-700">Logged{logged > 1 ? ` ×${logged}` : ''} ✓</span>}
      {record.isError && <span className="text-xs text-red-600">Couldn&apos;t save — try again</span>}
    </div>
  );
}

function SurfRackStockBanner({ storeId, date }: { storeId: string; date?: string }) {
  const day = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [openedAt] = useState(() => new Date().toISOString());
  const start = date ? `${day}T00:00:00+08:00` : openedAt;
  const { data } = useSurfRackAvailability({ storeId, pickupDatetime: start, dropoffDatetime: `${day}T23:59:59+08:00` });
  if (!data?.tracked) return null;
  return (
    <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${data.remaining === 0 ? 'bg-red-50 text-red-700' : 'bg-teal-50 text-teal-800'}`}>
      🏄 Surf racks: {data.remaining} of {data.total} free {date ? 'all day' : 'for the rest of today'}
    </p>
  );
}

function ModelCard({ model, turnedAwayStoreId }: { model: AvailabilityModelRow; turnedAwayStoreId: string | null }) {
  const hasReturns = model.returningToday.length > 0;
  const fullyUnavailable = model.availableNow === 0 && !hasReturns;

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      {/* Row 1 — name + availability badge */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-gray-900">{model.modelName}</span>
        {model.availableNow > 0 ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            {model.availableNow} available
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            None available
          </span>
        )}
      </div>

      {/* Row 2 — surf rack pills (scooters only, when units are free) */}
      {model.isScooter && model.availableNow > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            🏄 {model.withSurfRack} with rack mount
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {model.withoutSurfRack} without rack mount
          </span>
        </div>
      )}

      {model.awaitingAssignment > 0 && (
        <p className="mb-2 text-xs text-amber-700">
          {model.awaitingAssignment} held for {model.awaitingAssignment === 1 ? 'a booking' : 'bookings'} awaiting
          collection (no vehicle assigned yet)
        </p>
      )}

      {/* Row 3 — returning today */}
      {hasReturns ? (
        <div>
          <p className="mb-1 text-xs text-gray-500">Returning today:</p>
          <div className="space-y-0.5">
            {model.returningToday.map((r) => (
              <div key={r.vehicleName + r.dropoffDatetime} className="flex items-center gap-1.5 text-xs text-gray-600">
                <Clock className="h-3 w-3 shrink-0 text-gray-400" />
                <span>
                  {r.vehicleName} — returns {formatDropoffTime(r.dropoffDatetime)}, available from {r.availableFrom}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        fullyUnavailable && (
          <p className="text-xs text-gray-400">No units returning today</p>
        )
      )}

      {model.availableNow === 0 && turnedAwayStoreId && (
        <TurnedAwayButton storeId={turnedAwayStoreId} modelId={model.modelId} />
      )}
    </div>
  );
}

export function AvailabilityDetailModal({ open, onClose, storeId, date }: Props) {
  const { data, isLoading } = useAvailabilityDetail(storeId, open, date);
  // Turn-aways are only meaningful for a walk-in standing at the counter today,
  // and need a concrete store to attribute them to.
  const turnedAwayStoreId = !date && storeId && storeId !== 'all' ? storeId : null;

  return (
    <Modal open={open} onClose={onClose} title="Fleet Availability" size="lg">
      <p className="mb-4 -mt-1 text-sm text-gray-500">{dateLabelFor(date)}</p>

      {open && storeId && storeId !== 'all' && <SurfRackStockBanner storeId={storeId} date={date} />}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && data && data.models.length > 0 && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {data.models.map((model) => (
            <ModelCard key={model.modelId} model={model} turnedAwayStoreId={turnedAwayStoreId} />
          ))}
        </div>
      )}

      {!isLoading && data?.models.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No fleet data available</p>
      )}

      <p className="mt-4 text-xs italic text-gray-400">
        30 minute handover buffer applied to return times
      </p>
    </Modal>
  );
}
