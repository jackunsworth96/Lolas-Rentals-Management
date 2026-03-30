import { useEffect, useMemo, useRef, useState } from 'react';
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

const ALL_TIME_SLOTS = generateTimeSlots();
const DEFAULT_PICKUP_TIME = '09:15';
const DEFAULT_DROPOFF_TIME = '16:45';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getAvailablePickupSlots(pickupDate: string): { value: string; label: string }[] {
  if (!pickupDate || pickupDate > todayStr()) return ALL_TIME_SLOTS;
  if (pickupDate < todayStr()) return ALL_TIME_SLOTS;
  const now = nowTimeMinutes();
  return ALL_TIME_SLOTS.filter((s) => timeToMinutes(s.value) > now);
}

function getAvailableDropoffSlots(
  pickupDate: string,
  pickupTime: string,
  dropoffDate: string,
): { value: string; label: string }[] {
  if (!pickupDate || !dropoffDate) return ALL_TIME_SLOTS;
  if (dropoffDate > pickupDate) return ALL_TIME_SLOTS;
  if (dropoffDate === pickupDate) {
    const pickupMins = timeToMinutes(pickupTime);
    return ALL_TIME_SLOTS.filter((s) => timeToMinutes(s.value) > pickupMins);
  }
  return ALL_TIME_SLOTS;
}

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

  const [dateError, setDateError] = useState('');

  const availablePickupSlots = useMemo(() => getAvailablePickupSlots(pickupDate), [pickupDate]);
  const availableDropoffSlots = useMemo(
    () => getAvailableDropoffSlots(pickupDate, pickupTime, dropoffDate),
    [pickupDate, pickupTime, dropoffDate],
  );

  function validateDates(pDate: string, pTime: string, dDate: string, dTime: string): boolean {
    if (!pDate || !dDate) { setDateError(''); return true; }
    const pickup = new Date(`${pDate}T${pTime}`);
    const dropoff = new Date(`${dDate}T${dTime}`);
    if (dropoff <= pickup) {
      setDateError('Return must be after pickup');
      return false;
    }
    setDateError('');
    return true;
  }

  function updatePickup(date: string, time: string) {
    const newTime = time || DEFAULT_PICKUP_TIME;
    const newPickup = date ? `${date}T${newTime}` : '';
    setDates(newPickup, dropoffDatetime);
    if (date) validateDates(date, newTime, dropoffDate, dropoffTime);
  }

  function updateDropoff(date: string, time: string) {
    const newTime = time || DEFAULT_DROPOFF_TIME;
    const newDropoff = date ? `${date}T${newTime}` : '';
    setDates(pickupDatetime, newDropoff);
    if (date) validateDates(pickupDate, pickupTime, date, newTime);
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

  const storeLocationName = useMemo(() => {
    if (!locations || locations.length === 0) return "Lola's Rentals";
    const store = locations.find(isStoreLocation);
    return store ? store.name : locations[0].name;
  }, [locations]);

  useEffect(() => {
    if (storeLocationId != null && pickupLocationId == null) {
      setLocations(storeLocationId, storeLocationId);
    }
  }, [storeLocationId, pickupLocationId, setLocations]);

  useEffect(() => {
    if (!pickupDate) return;
    const slots = getAvailablePickupSlots(pickupDate);

    // Current pickupTime is valid — nothing to correct
    if (slots.some((s) => s.value === pickupTime)) return;

    let newPickupDate = pickupDate;
    let newPickupTime: string;

    if (slots.length > 0) {
      // Today still has future slots — advance to first available
      newPickupTime = slots[0].value;
    } else {
      // All today's slots are past — move to tomorrow at 09:15
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      newPickupDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      newPickupTime = generateTimeSlots()[0].value;
    }

    // Re-validate dropoff time against the corrected pickup
    let newDropoffDatetime = dropoffDatetime;
    if (dropoffDate) {
      const dropoffSlots = getAvailableDropoffSlots(newPickupDate, newPickupTime, dropoffDate);
      if (dropoffSlots.length > 0 && !dropoffSlots.some((s) => s.value === dropoffTime)) {
        newDropoffDatetime = `${dropoffDate}T${dropoffSlots[0].value}`;
      }
    }

    setDates(`${newPickupDate}T${newPickupTime}`, newDropoffDatetime);
  }, [pickupDate, pickupTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickupLoc = locations?.find((l) => l.id === pickupLocationId);
  const dropoffLoc = locations?.find((l) => l.id === dropoffLocationId);
  const pickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const dropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;

  const canSearch = !!storeId && !!pickupDatetime && !!dropoffDatetime && !dateError;

  const minPickupDate = todayStr();

  return (
    <div className="rounded-4xl bg-sand-brand p-6 shadow-sm md:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Store — driven from locations API */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Store</label>
          <div className={`${inputClass} flex items-center gap-2`}>
            <span className="text-teal-brand">📍</span>
            <span className="font-bold">{storeLocationName}</span>
          </div>
        </div>

        {/* Pickup Date + Time */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">Pickup Date & Time</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={pickupDate}
              min={minPickupDate}
              onChange={(e) => updatePickup(e.target.value, pickupTime)}
              className={`${inputClass} flex-1`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={pickupTime}
                onChange={(e) => updatePickup(pickupDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7`}
              >
                {availablePickupSlots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              min={pickupDate || minPickupDate}
              onChange={(e) => updateDropoff(e.target.value, dropoffTime)}
              className={`${inputClass} flex-1 ${dateError ? 'ring-2 ring-red-400' : ''}`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={dropoffTime}
                onChange={(e) => updateDropoff(dropoffDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7 ${dateError ? 'ring-2 ring-red-400' : ''}`}
              >
                {availableDropoffSlots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
            </div>
          </div>
          {dateError && (
            <p className="ml-1 text-xs font-bold text-red-500">{dateError}</p>
          )}
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
