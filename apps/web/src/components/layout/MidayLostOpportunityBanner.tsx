import { useState, useEffect, useRef, useCallback } from 'react';
import { useCreateLostOpportunity } from '../../api/lost-opportunity.js';

interface Props {
  storeId: string;
}

const LOST_OPP_REASONS = [
  'No availability',
  'Price too high',
  'Competitor',
  'Customer changed mind',
  'Other',
] as const;
type LostOppReason = (typeof LOST_OPP_REASONS)[number];

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `lost_opp_midday_dismissed_${yyyy}-${mm}-${dd}`;
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInWindow(offsetMins: number): boolean {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMins = h * 60 + m;
  // Show between 12:00 + offsetMins and 13:00
  const start = 12 * 60 + offsetMins;
  const end = 13 * 60;
  return totalMins >= start && totalMins < end;
}

export function MidayLostOpportunityBanner({ storeId }: Props) {
  // Random offset (0–59 min) generated once per mount — stable across re-renders
  const offsetRef = useRef<number>(Math.floor(Math.random() * 60));

  const [visible, setVisible] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // Form state
  const [vehicle, setVehicle] = useState('');
  const [reason, setReason] = useState<LostOppReason>('No availability');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const createLostOpp = useCreateLostOpportunity();

  const dismiss = useCallback(() => {
    localStorage.setItem(todayKey(), '1');
    setVisible(false);
    setShowForm(false);
  }, []);

  const checkShouldShow = useCallback(() => {
    if (localStorage.getItem(todayKey())) return; // already dismissed today
    if (!storeId) return; // no store selected yet
    if (isInWindow(offsetRef.current)) {
      setVisible(true);
    } else {
      // Outside window — hide in case time moved past 13:00
      setVisible(false);
    }
  }, [storeId]);

  useEffect(() => {
    checkShouldShow();
    const id = setInterval(checkShouldShow, 60_000);
    return () => clearInterval(id);
  }, [checkShouldShow]);

  function handleSave() {
    if (!vehicle.trim()) return;
    createLostOpp.mutate(
      {
        storeId,
        date: todayDate(),
        vehicleRequested: vehicle.trim(),
        reason,
        quantity: 1,
        durationDays: duration ? parseInt(duration) : null,
        staffNotes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setSuccessMsg(true);
          setTimeout(dismiss, 1500);
        },
      },
    );
  }

  if (!visible) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] shadow-md"
      style={{ backgroundColor: '#FCBC5A', color: '#363737' }}
    >
      {/* Main bar */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span className="text-lg" aria-hidden>
          🐾
        </span>
        <p className="flex-1 text-sm font-medium" style={{ color: '#363737' }}>
          Midday check — any lost bookings this morning? Log them now so nothing
          gets missed.
        </p>
        {successMsg ? (
          <span className="text-sm font-bold text-green-800">Logged ✓</span>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg border-2 px-4 py-1.5 text-sm font-bold transition-colors hover:bg-black/10"
              style={{ borderColor: '#363737', color: '#363737' }}
            >
              + Log a lost booking
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-4 py-1.5 text-sm font-medium opacity-70 hover:opacity-100"
              style={{ color: '#363737' }}
            >
              All good, none today
            </button>
          </div>
        )}
      </div>

      {/* Inline form — slides open */}
      {showForm && !successMsg && (
        <div
          className="border-t px-5 pb-4 pt-3"
          style={{ borderColor: 'rgba(54,55,55,0.2)', backgroundColor: 'rgba(255,255,255,0.35)' }}
        >
          <div className="flex flex-wrap gap-3">
            {/* Vehicle */}
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#363737' }}>
                Vehicle requested *
              </label>
              <input
                type="text"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. Honda Beat, TukTuk"
                className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: '#363737' }}
              />
            </div>

            {/* Reason */}
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#363737' }}>
                Reason *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as LostOppReason)}
                className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: '#363737' }}
              >
                {LOST_OPP_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div className="w-28">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#363737' }}>
                Days (opt.)
              </label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: '#363737' }}
              />
            </div>

            {/* Notes */}
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: '#363737' }}>
                Notes (opt.)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra detail"
                className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: '#363737' }}
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-end gap-2 pb-0.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={!vehicle.trim() || createLostOpp.isPending}
                className="rounded-lg px-5 py-2 text-sm font-bold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#363737', color: '#FCBC5A' }}
              >
                {createLostOpp.isPending ? 'Saving…' : 'Save & dismiss'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium opacity-70 hover:opacity-100"
                style={{ color: '#363737' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
