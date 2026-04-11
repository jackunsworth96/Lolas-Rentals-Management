import { Clock } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import {
  useAvailabilityDetail,
  type AvailabilityModelRow,
} from '../../api/dashboard-availability.js';

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

function ModelCard({ model }: { model: AvailabilityModelRow }) {
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
            🏄 {model.withSurfRack} with surf rack
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {model.withoutSurfRack} without surf rack
          </span>
        </div>
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
    </div>
  );
}

export function AvailabilityDetailModal({ open, onClose, storeId, date }: Props) {
  const { data, isLoading } = useAvailabilityDetail(storeId, open, date);

  return (
    <Modal open={open} onClose={onClose} title="Fleet Availability" size="lg">
      <p className="mb-4 -mt-1 text-sm text-gray-500">{dateLabelFor(date)}</p>

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
            <ModelCard key={model.modelId} model={model} />
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
