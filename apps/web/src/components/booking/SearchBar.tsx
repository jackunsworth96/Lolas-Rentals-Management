import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBookingStore } from '../../stores/bookingStore.js';
import { api } from '../../api/client.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';

export interface LocationRow {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

interface SearchBarProps {
  onSearch: () => void;
  searching: boolean;
}

// TODO: fetch pickup/dropoff time slots from backoffice settings API when available
function generateTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  const start = 9 * 60 + 15;
  const end = 16 * 60 + 45;
  for (let m = start; m <= end; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(min).padStart(2, '0');
    const value = `${hh}:${mm}`;
    const h12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const label = `${h12}:${mm} ${ampm}`;
    slots.push({ value, label });
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();
const DEFAULT_PICKUP_TIME = '09:15';
const DEFAULT_DROPOFF_TIME = '16:45';

const inputClass =
  'w-full rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-teal-brand';

function isStoreLocation(loc: LocationRow): boolean {
  if (loc.locationType === 'store') return true;
  return loc.deliveryCost === 0 && loc.collectionCost === 0;
}

export function SearchBar({ onSearch, searching }: SearchBarProps) {
  const storeId = useBookingStore((s) => s.storeId);
  const searchTrigger = useBookingStore((s) => s.searchTrigger);
  const prevTrigger = useRef(searchTrigger);
  useEffect(() => {
    if (searchTrigger > prevTrigger.current) { prevTrigger.current = searchTrigger; onSearch(); }
  }, [searchTrigger, onSearch]);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const setDates = useBookingStore((s) => s.setDates);
  const setLocations = useBookingStore((s) => s.setLocations);

  const pickupDate = pickupDatetime.slice(0, 10);
  const pickupTime = pickupDatetime.slice(11, 16) || DEFAULT_PICKUP_TIME;
  const dropoffDate = dropoffDatetime.slice(0, 10);
  const dropoffTime = dropoffDatetime.slice(11, 16) || DEFAULT_DROPOFF_TIME;

  function updatePickup(date: string, time: string) {
    setDates(date ? `${date}T${time || DEFAULT_PICKUP_TIME}` : '', dropoffDatetime);
  }
  function updateDropoff(date: string, time: string) {
    setDates(pickupDatetime, date ? `${date}T${time || DEFAULT_DROPOFF_TIME}` : '');
  }

  const { data: locations } = useQuery<LocationRow[]>({
    queryKey: ['public-locations', storeId],
    queryFn: () => api.get(`/public/booking/locations?storeId=${storeId}`),
    enabled: !!storeId,
  });

  const storeLocationId = useMemo(() => {
    if (!locations || locations.length === 0) return null;
    const store = locations.find(isStoreLocation);
    return store ? store.id : locations[0].id;
  }, [locations]);

  useEffect(() => {
    if (storeLocationId != null && pickupLocationId == null) {
      setLocations(storeLocationId, storeLocationId);
    }
  }, [storeLocationId, pickupLocationId, setLocations]);

  const pickupLoc = locations?.find((l) => l.id === pickupLocationId);
  const dropoffLoc = locations?.find((l) => l.id === dropoffLocationId);
  const pickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const dropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;

  const canSearch = !!storeId && !!pickupDatetime && !!dropoffDatetime;

  return (
    <div className="rounded-4xl bg-sand-brand p-6 shadow-sm md:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Store — static label (single store) */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Location</label>
          <div className={`${inputClass} flex items-center gap-2`}>
            <span className="text-teal-brand">📍</span>
            <span className="font-bold">Lola's Rentals (General Luna)</span>
          </div>
        </div>

        {/* Pickup Date + Time */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Pickup Date & Time</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={pickupDate}
              onChange={(e) => updatePickup(e.target.value, pickupTime)}
              className={`${inputClass} flex-1`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={pickupTime}
                onChange={(e) => updatePickup(pickupDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7`}
              >
                {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
            </div>
          </div>
        </div>

        {/* Return Date + Time */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Return Date & Time</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={dropoffDate}
              onChange={(e) => updateDropoff(e.target.value, dropoffTime)}
              min={pickupDate || undefined}
              className={`${inputClass} flex-1`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={dropoffTime}
                onChange={(e) => updateDropoff(dropoffDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7`}
              >
                {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
            </div>
          </div>
        </div>
      </div>

      {/* Location selectors + Search CTA */}
      {locations && locations.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-charcoal-brand/10 pt-6 md:grid-cols-3">
          <div className="space-y-2">
            <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Pickup Location</label>
            <div className="relative">
              <select
                value={pickupLocationId ?? ''}
                onChange={(e) => setLocations(Number(e.target.value), dropoffLocationId)}
                className={`${inputClass} appearance-none`}
              >
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
            </div>
            {pickupFee > 0 && (
              <p className="ml-1 text-xs font-bold text-teal-brand">Delivery fee: ₱{pickupFee.toLocaleString()}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Dropoff Location</label>
            <div className="relative">
              <select
                value={dropoffLocationId ?? ''}
                onChange={(e) => setLocations(pickupLocationId, Number(e.target.value))}
                className={`${inputClass} appearance-none`}
              >
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
            </div>
            {dropoffFee > 0 && (
              <p className="ml-1 text-xs font-bold text-teal-brand">Collection fee: ₱{dropoffFee.toLocaleString()}</p>
            )}
          </div>

          <div className="flex items-end">
            <PrimaryCtaButton
              type="button"
              onClick={onSearch}
              disabled={!canSearch || searching}
              className="flex w-full items-center justify-center gap-2 py-3.5"
            >
              {searching ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
              ) : '🔍'}
              {searching ? 'Searching…' : 'Update Search'}
            </PrimaryCtaButton>
          </div>
        </div>
      )}
    </div>
  );
}
