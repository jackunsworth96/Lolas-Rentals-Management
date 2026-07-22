import { useEffect, useState } from 'react';
import {
  useCancelFleetUnavailability,
  useCreateFleetUnavailability,
  useFleetUnavailability,
  useUpdateFleetUnavailability,
  type FleetUnavailability,
} from '../../api/fleet.js';
import { Modal } from '../common/Modal.js';

interface Props {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  storeId: string;
}

function manilaInputValue(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value)).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function toManilaIso(value: string): string {
  return value ? `${value}:00+08:00` : '';
}

function displayDate(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  });
}

export function OwnerUseModal({ open, onClose, vehicleId, vehicleName, storeId }: Props) {
  const periods = useFleetUnavailability(storeId, vehicleId);
  const createPeriod = useCreateFleetUnavailability();
  const updatePeriod = useUpdateFleetUnavailability();
  const cancelPeriod = useCancelFleetUnavailability();
  const [editing, setEditing] = useState<FleetUnavailability | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    setEditing(null);
    setStartsAt(manilaInputValue(start));
    setEndsAt(manilaInputValue(end));
    setNote('');
    setError('');
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open, vehicleId]);

  const startEditing = (period: FleetUnavailability) => {
    setEditing(period);
    setStartsAt(manilaInputValue(period.startsAt));
    setEndsAt(manilaInputValue(period.endsAt));
    setNote(period.note ?? '');
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const startIso = toManilaIso(startsAt);
    const endIso = toManilaIso(endsAt);
    if (!startIso || !endIso || new Date(startIso) >= new Date(endIso)) {
      setError('End must be after start.');
      return;
    }
    try {
      if (editing) {
        await updatePeriod.mutateAsync({ id: editing.id, startsAt: startIso, endsAt: endIso, note: note.trim() || null });
      } else {
        await createPeriod.mutateAsync({
          vehicleId, storeId, type: 'owner_use', startsAt: startIso, endsAt: endIso, note: note.trim() || null,
        });
      }
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save owner use.');
    }
  };

  const cancel = async (period: FleetUnavailability) => {
    if (!window.confirm(`Cancel the owner-use period starting ${displayDate(period.startsAt)}?`)) return;
    setError('');
    try {
      await cancelPeriod.mutateAsync(period.id);
      if (editing?.id === period.id) resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel owner use.');
    }
  };

  const now = Date.now();
  const activeOrUpcoming = (periods.data ?? []).filter((period) => new Date(period.endsAt).getTime() > now);

  return (
    <Modal open={open} onClose={onClose} title={`Owner Use — ${vehicleName}`} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-gray-600">
          Owner use removes this vehicle from customer and partner availability only for the selected period.
          Times are shown in Manila time.
        </p>

        <form onSubmit={save} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">{editing ? 'Edit owner use' : 'Schedule owner use'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700">
              Start
              <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm text-gray-700">
              End
              <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm text-gray-700">
            Note (optional)
            <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2}
              placeholder="e.g. Private long-term rental"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            {editing && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                Stop editing
              </button>
            )}
            <button type="submit" disabled={createPeriod.isPending || updatePeriod.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {editing ? 'Save changes' : 'Schedule owner use'}
            </button>
          </div>
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Active and scheduled periods</h3>
          {periods.isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : activeOrUpcoming.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">No owner use scheduled.</p>
          ) : (
            <div className="space-y-2">
              {activeOrUpcoming.map((period) => {
                const active = new Date(period.startsAt).getTime() <= now;
                return (
                  <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                        <span>{active ? 'Owner Use' : 'Scheduled Owner Use'}</span>
                        <span className="font-normal text-amber-700">{displayDate(period.startsAt)} — {displayDate(period.endsAt)}</span>
                      </div>
                      {period.note && <p className="mt-1 text-xs text-amber-800">{period.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEditing(period)} className="text-sm text-blue-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => cancel(period)} className="text-sm text-red-700 hover:underline">Cancel</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
