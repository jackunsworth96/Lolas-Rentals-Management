import { useState } from 'react';
import { useReleasePartnerProtection } from '../../api/fleet.js';
import { useAuthStore } from '../../stores/auth-store.js';

interface Props {
  storeId: string;
  partners: Array<{ partnerId: string | null; partnerName: string | null }>;
  vehicleType: 'bike' | 'tuktuk';
  startsAt: string;
  endsAt: string;
  /** Called after the release is saved, e.g. to retry the booking. */
  onReleased?: () => void;
}

/**
 * Explains that a partner allocation is holding a vehicle back and lets a
 * Manager/Admin release one unit for this booking, with a reason on record.
 */
export function PartnerReleasePanel({ storeId, partners, vehicleType, startsAt, endsAt, onReleased }: Props) {
  const canRelease = useAuthStore((s) => s.hasPermission('can_edit_fleet'));
  const release = useReleasePartnerProtection();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const named = partners.filter((p): p is { partnerId: string; partnerName: string } => Boolean(p.partnerId && p.partnerName));
  const [partnerId, setPartnerId] = useState(named[0]?.partnerId ?? '');
  const names = named.map((p) => p.partnerName).join(' and ') || 'a partner';
  const noun = vehicleType === 'tuktuk' ? 'TukTuk' : 'bike';

  async function submit() {
    if (!partnerId || reason.trim().length < 3) return;
    try {
      await release.mutateAsync({ storeId, partnerId, vehicleType, startsAt, endsAt, reason: reason.trim() });
    } catch {
      return;
    }
    setOpen(false);
    setReason('');
    onReleased?.();
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-lato text-xs text-amber-900">
      <p>
        <span className="font-semibold">Protected for {names}.</span>{' '}
        This {noun} has to stay free for their guests on these dates, so the system won&apos;t let it go to this booking.
      </p>
      {!canRelease && <p>Pick another {noun} or other dates. Only a Manager or Admin can release it.</p>}
      {canRelease && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-amber-400 bg-white px-3 py-1 font-semibold text-amber-900 hover:bg-amber-100"
        >
          Release one {noun} for this booking…
        </button>
      )}
      {canRelease && open && (
        <div className="space-y-2">
          {named.length > 1 && (
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full rounded-md border border-amber-300 px-2 py-1">
              {named.map((p) => <option key={p.partnerId} value={p.partnerId}>{p.partnerName}</option>)}
            </select>
          )}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={`Why can ${names} spare one on these dates? This is recorded with your name.`}
            className="w-full rounded-md border border-amber-300 px-2 py-1 text-gray-900"
          />
          <p>
            This lowers {names}&apos;s allowance by one for these dates. It shows on the Partner Allocations page and is sent to the Fleet Telegram group.
          </p>
          {release.error && <p className="text-red-700">{release.error instanceof Error ? release.error.message : 'Could not release it.'}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={release.isPending || reason.trim().length < 3 || !partnerId}
              onClick={() => void submit()}
              className="rounded-md bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {release.isPending ? 'Releasing…' : 'Release and continue'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-amber-900 hover:bg-amber-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
