import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPublicAddons,
  fetchPublicLocations,
  fetchPublicModels,
  usePartnerBook,
  usePartnerMe,
  type PartnerBookingInput,
} from '../../api/partner-portal.js';

const BOOKING_TIMES = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
];

function manilaDate(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toManilaIso(date: string, time: string) {
  return date && time ? `${date}T${time}:00+08:00` : '';
}

function addonPrice(addon: { addonType: 'per_day' | 'one_time'; pricePerDay: number; priceOneTime: number }) {
  return addon.addonType === 'per_day'
    ? `₱${Number(addon.pricePerDay ?? 0).toLocaleString('en-PH')}/day`
    : `₱${Number(addon.priceOneTime ?? 0).toLocaleString('en-PH')} one-time`;
}

export default function PartnerBookPage() {
  const { data: me } = usePartnerMe();
  const storeId = me?.partner.store_id ?? '';
  const models = useQuery({ queryKey: ['partner', 'public-models', storeId], queryFn: () => fetchPublicModels(storeId), enabled: !!storeId });
  const locations = useQuery({ queryKey: ['partner', 'public-locations', storeId], queryFn: () => fetchPublicLocations(storeId), enabled: !!storeId });
  const book = usePartnerBook();
  const storeLocationId = useMemo(() => {
    const rows = locations.data ?? [];
    return rows.find((l) => l.locationType === 'store')?.id ?? rows[0]?.id ?? 1;
  }, [locations.data]);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerMobile: '',
    vehicleModelId: '',
    pickupDate: manilaDate(24),
    pickupTime: '09:15',
    dropoffDate: manilaDate(72),
    dropoffTime: '16:45',
    pickupLocationId: 0,
    dropoffLocationId: 0,
    accommodationName: me?.partner.name ?? '',
    roomReference: '',
    extraComments: '',
  });
  const [successRef, setSuccessRef] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<number>>(() => new Set());
  const addons = useQuery({
    queryKey: ['partner', 'public-addons', storeId, form.vehicleModelId],
    queryFn: () => fetchPublicAddons(storeId, form.vehicleModelId),
    enabled: !!storeId && !!form.vehicleModelId,
  });

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleVehicleChange(vehicleModelId: string) {
    setSelectedAddonIds(new Set());
    set('vehicleModelId', vehicleModelId);
  }

  function toggleAddon(id: number) {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessRef(null);
    try {
      const body: PartnerBookingInput = {
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerMobile: form.customerMobile.trim(),
        vehicleModelId: form.vehicleModelId,
        pickupDatetime: toManilaIso(form.pickupDate, form.pickupTime),
        dropoffDatetime: toManilaIso(form.dropoffDate, form.dropoffTime),
        pickupLocationId: form.pickupLocationId || storeLocationId,
        dropoffLocationId: form.dropoffLocationId || storeLocationId,
        addonIds: Array.from(selectedAddonIds),
        accommodationName: form.accommodationName.trim() || me?.partner.name || undefined,
        roomReference: form.roomReference.trim() || undefined,
        extraComments: form.extraComments.trim() || undefined,
      };
      const result = await book.mutateAsync(body);
      setSuccessRef(result.orderReference);
      setForm((prev) => ({ ...prev, customerName: '', customerEmail: '', customerMobile: '', roomReference: '', extraComments: '' }));
      setSelectedAddonIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    }
  }

  const locationOptions = locations.data ?? [];

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">Book for a Guest</h1>
      <p className="mt-1 text-sm text-gray-500">This booking will be automatically attributed to {me?.partner.name ?? 'your partner account'}.</p>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Guest name</label>
          <input required value={form.customerName} onChange={(e) => set('customerName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Guest phone / WhatsApp</label>
          <input required value={form.customerMobile} onChange={(e) => set('customerMobile', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Guest email</label>
          <input required type="email" value={form.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Vehicle</label>
          <select required value={form.vehicleModelId} onChange={(e) => handleVehicleChange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select vehicle</option>
            {(models.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.minDailyRate ? ` from ₱${m.minDailyRate}/day` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Pickup</label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input required type="date" value={form.pickupDate} onChange={(e) => set('pickupDate', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select required value={form.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {BOOKING_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Return</label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input required type="date" value={form.dropoffDate} onChange={(e) => set('dropoffDate', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select required value={form.dropoffTime} onChange={(e) => set('dropoffTime', e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {BOOKING_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Pickup location</label>
          <select value={form.pickupLocationId || storeLocationId} onChange={(e) => set('pickupLocationId', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Return location</label>
          <select value={form.dropoffLocationId || storeLocationId} onChange={(e) => set('dropoffLocationId', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Accommodation / room reference</label>
          <input value={form.roomReference} onChange={(e) => set('roomReference', e.target.value)} placeholder="Room 12, front desk guest, etc." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
          <input value={form.extraComments} onChange={(e) => set('extraComments', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="lg:col-span-2">
          <p className="mb-2 text-xs font-semibold text-gray-500">Add-ons</p>
          {!form.vehicleModelId ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">Select a vehicle first to see add-ons.</div>
          ) : addons.isLoading ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-400">Loading add-ons...</div>
          ) : (addons.data ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {(addons.data ?? []).map((addon) => {
                const id = Number(addon.id);
                return (
                  <label key={addon.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedAddonIds.has(id)}
                      onChange={() => toggleAddon(id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{addon.name}</span>
                      <span className="block text-xs text-gray-500">{addonPrice(addon)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">No add-ons available for this vehicle.</div>
          )}
        </div>
        <div className="lg:col-span-2">
          {successRef && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">Booking created: {successRef}</p>}
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={book.isPending} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {book.isPending ? 'Creating booking...' : 'Create booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
