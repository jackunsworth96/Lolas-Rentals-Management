import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBookingStore } from '../../stores/bookingStore.js';
import { api } from '../../api/client.js';

interface LocationRow {
  id: number;
  name: string;
  deliveryCost?: number;
  collectionCost?: number;
}

interface SearchBarProps {
  stores: Array<{ id: string; name: string }>;
  onSearch: () => void;
  searching: boolean;
}

export function SearchBar({ stores, onSearch, searching }: SearchBarProps) {
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const setStore = useBookingStore((s) => s.setStore);
  const setDates = useBookingStore((s) => s.setDates);
  const setLocations = useBookingStore((s) => s.setLocations);

  const { data: locations } = useQuery<LocationRow[]>({
    queryKey: ['public-locations', storeId],
    queryFn: () => api.get(`/public/booking/locations?storeId=${storeId}`),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (locations && locations.length > 0 && pickupLocationId == null) {
      setLocations(locations[0].id, locations[0].id);
    }
  }, [locations, pickupLocationId, setLocations]);

  const canSearch = !!storeId && !!pickupDatetime && !!dropoffDatetime;

  return (
    <div className="rounded-4xl bg-sand-brand p-6 shadow-sm md:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {/* Store */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">
            Location
          </label>
          <div className="relative">
            <select
              value={storeId}
              onChange={(e) => setStore(e.target.value)}
              className="w-full appearance-none rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all focus:ring-2 focus:ring-teal-brand"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-3 text-charcoal-brand/50">▾</span>
          </div>
        </div>

        {/* Pickup Date */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">
            Pickup Date
          </label>
          <input
            type="date"
            value={pickupDatetime.slice(0, 10)}
            onChange={(e) => setDates(e.target.value ? `${e.target.value}T09:00` : '', dropoffDatetime)}
            className="w-full rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all focus:ring-2 focus:ring-teal-brand"
          />
        </div>

        {/* Return Date */}
        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">
            Return Date
          </label>
          <input
            type="date"
            value={dropoffDatetime.slice(0, 10)}
            onChange={(e) => setDates(pickupDatetime, e.target.value ? `${e.target.value}T17:00` : '')}
            min={pickupDatetime.slice(0, 10) || undefined}
            className="w-full rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all focus:ring-2 focus:ring-teal-brand"
          />
        </div>

        {/* Search CTA */}
        <div className="flex items-end">
          <button
            onClick={onSearch}
            disabled={!canSearch || searching}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-brand py-3.5 font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {searching ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              '🔍'
            )}
            {searching ? 'Searching…' : 'Update Search'}
          </button>
        </div>
      </div>

      {/* Location selectors */}
      {locations && locations.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-charcoal-brand/10 pt-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">
              Pickup Location
            </label>
            <select
              value={pickupLocationId ?? ''}
              onChange={(e) => setLocations(Number(e.target.value), dropoffLocationId)}
              className="w-full appearance-none rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all focus:ring-2 focus:ring-teal-brand"
            >
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="ml-1 text-xs font-bold uppercase tracking-widest text-teal-brand">
              Dropoff Location
            </label>
            <select
              value={dropoffLocationId ?? ''}
              onChange={(e) => setLocations(pickupLocationId, Number(e.target.value))}
              className="w-full appearance-none rounded-2xl border-none bg-cream-brand px-4 py-3 font-medium text-charcoal-brand transition-all focus:ring-2 focus:ring-teal-brand"
            >
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
