import { useState } from 'react';
import { useAvailabilityExplanation } from '../../api/fleet.js';
import { Modal } from '../common/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
}

function manilaDateTime(offsetDays: number): string {
  const value = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T09:15`;
}

const reasonLabel = {
  order: 'Assigned booking',
  walk_in: 'Walk-in reservation',
  owner_use: 'Owner Use',
  missing_model: 'Missing model',
  non_rentable_status: 'Non-rentable status',
  inactive_model: 'Inactive model',
} as const;

export function AvailabilityExplanationModal({ open, onClose, storeId }: Props) {
  const [pickup, setPickup] = useState(() => manilaDateTime(0));
  const [dropoff, setDropoff] = useState(() => manilaDateTime(2));
  const [search, setSearch] = useState<{ pickup: string; dropoff: string } | null>(null);
  const result = useAvailabilityExplanation({
    storeId,
    pickupDatetime: search ? `${search.pickup}:00+08:00` : '',
    dropoffDatetime: search ? `${search.dropoff}:00+08:00` : '',
    enabled: Boolean(search),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (new Date(`${pickup}:00+08:00`) < new Date(`${dropoff}:00+08:00`)) setSearch({ pickup, dropoff });
  };

  return (
    <Modal open={open} onClose={onClose} title="Explain availability" size="xl">
      <div className="space-y-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3">
          <label className="text-sm text-gray-700">Pickup
            <input type="datetime-local" required value={pickup} onChange={(event) => setPickup(event.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">Dropoff
            <input type="datetime-local" required value={dropoff} onChange={(event) => setDropoff(event.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Check</button>
          <span className="pb-2 text-xs text-gray-500">Manila time</span>
        </form>

        {result.isLoading && <p className="text-sm text-gray-500">Calculating availability…</p>}
        {result.error && <p className="text-sm text-red-600">{result.error instanceof Error ? result.error.message : 'Could not calculate availability.'}</p>}
        {result.data && (
          <div className="space-y-4">
            {result.data.models.map((model) => (
              <section key={model.modelId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{model.modelName}</h3>
                  <span className="text-sm font-semibold text-blue-700">{model.availableCount} available of {model.totalEligible}</span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  {model.exactVehicleExclusions.map((vehicle) => (
                    <div key={vehicle.vehicleId} className="flex justify-between gap-3">
                      <span>{vehicle.vehicleName}</span>
                      <span>{vehicle.reasons.map((reason) => reasonLabel[reason]).join(', ')}</span>
                    </div>
                  ))}
                  {model.capacityDeductions.directReservations > 0 && (
                    <div className="flex justify-between gap-3"><span>Unassigned direct reservations</span><span>−{model.capacityDeductions.directReservations}</span></div>
                  )}
                  {model.capacityDeductions.holds > 0 && (
                    <div className="flex justify-between gap-3"><span>Active customer holds</span><span>−{model.capacityDeductions.holds}</span></div>
                  )}
                  {model.exactVehicleExclusions.length === 0 && model.capacityDeductions.directReservations === 0 && model.capacityDeductions.holds === 0 && (
                    <p className="text-gray-400">No availability deductions.</p>
                  )}
                </div>
              </section>
            ))}
            {result.data.configurationExclusions.length > 0 && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-900">Fleet configuration exclusions</h3>
                <div className="mt-2 space-y-1 text-sm text-amber-800">
                  {result.data.configurationExclusions.map((vehicle) => (
                    <div key={vehicle.vehicleId}>{vehicle.vehicleName} — {reasonLabel[vehicle.reason]}{vehicle.detail ? ` (${vehicle.detail})` : ''}</div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
