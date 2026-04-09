import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBookingStore } from '../../stores/bookingStore.js';
import { api } from '../../api/client.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';
import BorderGlow from '../home/BorderGlow.js';
import { locationIcon } from '../public/customerContactIcons.js';
import searchIcon from '../../assets/Original Assests/search_icon.svg';


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
    if (!pickupTime) return ALL_TIME_SLOTS;
    const pickupMins = timeToMinutes(pickupTime);
    return ALL_TIME_SLOTS.filter((s) => timeToMinutes(s.value) > pickupMins);
  }
  return ALL_TIME_SLOTS;
}

const inputClass =
  'w-full rounded-xl border border-[#d1c4b0] bg-white px-4 py-2.5 text-sm font-medium text-charcoal-brand shadow-sm transition-all duration-200 focus:border-[#00577C] focus:outline-none focus:ring-2 focus:ring-[#00577C]/25';

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
  const pickupTime =
    pickupDatetime.includes('T') && pickupDatetime.slice(11, 16).length === 5
      ? pickupDatetime.slice(11, 16)
      : '';
  const dropoffDate = dropoffDatetime.slice(0, 10);
  const dropoffTime =
    dropoffDatetime.includes('T') && dropoffDatetime.slice(11, 16).length === 5
      ? dropoffDatetime.slice(11, 16)
      : '';

  const [dateError, setDateError] = useState('');

  const availablePickupSlots = useMemo(() => getAvailablePickupSlots(pickupDate), [pickupDate]);
  const availableDropoffSlots = useMemo(
    () => getAvailableDropoffSlots(pickupDate, pickupTime, dropoffDate),
    [pickupDate, pickupTime, dropoffDate],
  );

  function validateDates(pDate: string, pTime: string, dDate: string, dTime: string): boolean {
    if (!pDate || !dDate) { setDateError(''); return true; }
    if (!pTime || !dTime) { setDateError(''); return true; }
    const pickup = new Date(`${pDate}T${pTime}`);
    const dropoff = new Date(`${dDate}T${dTime}`);
    if (dropoff <= pickup) {
      setDateError('Return must be after pickup');
      return false;
    }
    setDateError('');
    return true;
  }

  /** Date-only until a time is chosen — no default pickup time. */
  function updatePickup(date: string, time: string) {
    let newPickup = '';
    if (date && time) {
      newPickup = `${date}T${time}:00+08:00`;
    } else if (date) {
      newPickup = date;
    }
    setDates(newPickup, dropoffDatetime);
    if (date && time) validateDates(date, time, dropoffDate, dropoffTime);
    else setDateError('');
  }

  /** Date-only until a return time is chosen — no default dropoff time. */
  function updateDropoff(date: string, time: string) {
    let newDropoff = '';
    if (date && time) {
      newDropoff = `${date}T${time}:00+08:00`;
    } else if (date) {
      newDropoff = date;
    }
    setDates(pickupDatetime, newDropoff);
    if (date && time) validateDates(pickupDate, pickupTime, date, time);
    else setDateError('');
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

  const pickupLoc = locations?.find((l) => l.id === pickupLocationId);
  const dropoffLoc = locations?.find((l) => l.id === dropoffLocationId);
  const pickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const dropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;

  const canSearch =
    !!storeId &&
    hasBookingDatetimeWithTime(pickupDatetime) &&
    hasBookingDatetimeWithTime(dropoffDatetime) &&
    !dateError;

  const minPickupDate = todayStr();

  return (
    <BorderGlow
      glowColor="40 96 67"
      backgroundColor="#FFFFFF"
      borderRadius={16}
      glowIntensity={0.9}
      coneSpread={30}
      colors={['#FCBC5A', '#F5A623', '#FAF6F0']}
    >
    <div className="rounded-[14px] bg-white/90 p-6 md:p-8">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Store — driven from locations API */}
        <div className="space-y-1.5">
          <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Store</label>
          <div className={`${inputClass} flex items-center gap-2`}>
            <img src={locationIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
            <span className="font-semibold">{storeLocationName}</span>
          </div>
        </div>

        {/* Pickup Date + Time */}
        <div className="space-y-1.5">
          <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Pickup Date & Time</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={pickupDate}
              min={minPickupDate}
              onChange={(e) => updatePickup(e.target.value, '')}
              className={`${inputClass} flex-1`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={pickupTime}
                onChange={(e) => updatePickup(pickupDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7`}
              >
                <option value="">Time</option>
                {availablePickupSlots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
            </div>
          </div>
        </div>

        {/* Return Date + Time */}
        <div className="space-y-1.5">
          <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Return Date & Time</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={dropoffDate}
              min={pickupDate || minPickupDate}
              onChange={(e) => updateDropoff(e.target.value, '')}
              className={`${inputClass} flex-1 ${dateError ? 'border-red-400 ring-2 ring-red-400/20' : ''}`}
            />
            <div className="relative w-28 shrink-0">
              <select
                value={dropoffTime}
                onChange={(e) => updateDropoff(dropoffDate, e.target.value)}
                className={`${inputClass} appearance-none pr-7 ${dateError ? 'border-red-400 ring-2 ring-red-400/20' : ''}`}
              >
                <option value="">Time</option>
                {availableDropoffSlots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
            </div>
          </div>
          {dateError && (
            <p className="ml-1 text-xs font-semibold text-red-500">{dateError}</p>
          )}
        </div>
      </div>

      {/* Location selectors + Search CTA */}
      {locations && locations.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-gray-100 pt-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Pickup Location</label>
            <div className="relative">
              <select
                value={pickupLocationId ?? ''}
                onChange={(e) => setLocations(Number(e.target.value), dropoffLocationId)}
                className={`${inputClass} appearance-none`}
              >
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
            </div>
            {pickupFee > 0 && (
              <p className="ml-1 text-xs font-semibold text-teal-700">
                Delivery fee:{' '}
                <span style={{ fontFamily: 'Lato, sans-serif' }}>₱</span>
                {pickupFee.toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="ml-1 text-xs font-bold uppercase tracking-wider text-teal-700">Return Location</label>
            <div className="relative">
              <select
                value={dropoffLocationId ?? ''}
                onChange={(e) => setLocations(pickupLocationId, Number(e.target.value))}
                className={`${inputClass} appearance-none`}
              >
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
            </div>
            {dropoffFee > 0 && (
              <p className="ml-1 text-xs font-semibold text-teal-700">
                Collection fee:{' '}
                <span style={{ fontFamily: 'Lato, sans-serif' }}>₱</span>
                {dropoffFee.toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={onSearch}
              disabled={!canSearch || searching}
              style={{
                backgroundColor: '#FCBC5A',
                color: '#363737',
                border: '2px solid #363737',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                boxShadow: '3px 3px 0 #363737',
                fontFamily: 'Lato, sans-serif',
                padding: '12px 24px',
                width: '100%',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                opacity: !canSearch || searching ? 0.5 : 1,
                cursor: !canSearch || searching ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (canSearch && !searching) {
                  e.currentTarget.style.transform = 'translate(-2px,-2px)';
                  e.currentTarget.style.boxShadow = '5px 5px 0 #363737';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '3px 3px 0 #363737';
              }}
            >
              {searching ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#363737] border-t-transparent" />
              ) : (
                <img
                  src={searchIcon}
                  alt=""
                  className="h-4 w-4 shrink-0 object-contain"
                  width={16}
                  height={16}
                  aria-hidden
                />
              )}
              {searching ? 'Searching…' : 'Search Available Vehicles'}
            </button>
          </div>
        </div>
      )}
    </div>
    </BorderGlow>
  );
}
