import { useEffect, useState } from 'react';
import { useUpdateDropoffNote } from '../../../api/orders.js';

interface LogisticsCardProps {
  orderId: string;
  pickupLocation?: string | null;
  pickupAddress?: string | null;
  dropoffLocation?: string | null;
  dropoffAddress?: string | null;
  meetingPoint?: string | null;
  canEdit: boolean;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-charcoal-brand/60">{label}</span>
      <span className="min-w-0 font-medium text-gray-900">{value}</span>
    </div>
  );
}

/** Where the vehicle goes out and comes back: locations, addresses and the meeting point. */
export function LogisticsCard({
  orderId,
  pickupLocation,
  pickupAddress,
  dropoffLocation,
  dropoffAddress,
  meetingPoint,
  canEdit,
}: LogisticsCardProps) {
  const [draft, setDraft] = useState(meetingPoint ?? '');
  const [editing, setEditing] = useState(false);
  const updateNote = useUpdateDropoffNote();

  useEffect(() => {
    setDraft(meetingPoint ?? '');
  }, [meetingPoint]);

  const pickup = [pickupLocation, pickupAddress && pickupAddress !== pickupLocation ? pickupAddress : null].filter(Boolean).join(' · ');
  const dropoff = [dropoffLocation, dropoffAddress && dropoffAddress !== dropoffLocation ? dropoffAddress : null].filter(Boolean).join(' · ');

  if (!pickup && !dropoff && !meetingPoint && !canEdit) return null;

  return (
    <section className="space-y-1.5 rounded-lg border border-gray-200 p-3">
      <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-charcoal-brand/50">Logistics</h4>
      {pickup && <Row label="Pickup" value={pickup} />}
      {dropoff && <Row label="Return" value={dropoff} />}
      {editing ? (
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Meeting point, e.g. across from Higala Hotel"
            maxLength={500}
            autoFocus
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand"
          />
          <button
            type="button"
            disabled={updateNote.isPending}
            onClick={() => updateNote.mutate({ id: orderId, note: draft.trim() || null }, { onSuccess: () => setEditing(false) })}
            className="rounded bg-teal-brand px-3 py-1 text-sm text-white hover:bg-teal-brand/90 disabled:opacity-50"
          >
            {updateNote.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(meetingPoint ?? ''); setEditing(false); }}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      ) : meetingPoint ? (
        <Row
          label="Meeting point"
          value={
            <>
              {meetingPoint}
              {canEdit && (
                <button type="button" onClick={() => setEditing(true)} className="ml-2 text-xs font-medium text-teal-brand hover:underline">
                  Edit
                </button>
              )}
            </>
          }
        />
      ) : canEdit ? (
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-teal-brand hover:underline">
          + Add meeting point
        </button>
      ) : null}
      {updateNote.error && <p className="text-xs text-red-600">{(updateNote.error as Error).message}</p>}
    </section>
  );
}
