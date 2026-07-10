import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Plus, Trash2 } from 'lucide-react';
import {
  fetchPublicAddons,
  fetchPublicLocations,
  fetchPublicModels,
  usePartnerBook,
  usePartnerMe,
  usePartnerQuote,
  type PartnerBookingInput,
  type PartnerQuote,
  type PartnerProfile,
  type PublicAddon,
  type PublicLocation,
  type PublicModel,
} from '../../api/partner-portal.js';
import { PeaceOfMindModal } from '../../components/basket/PeaceOfMindModal.js';

const BOOKING_TIMES = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type VehicleLine = { id: string; vehicleModelId: string; driverName: string };

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

function money(value: number) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function addonPrice(addon: Pick<PublicAddon, 'addonType' | 'pricePerDay' | 'priceOneTime'>) {
  return addon.addonType === 'per_day'
    ? `${money(addon.pricePerDay)}/day`
    : `${money(addon.priceOneTime)} one-time`;
}

function addonDescription(name: string) {
  const n = name.toLowerCase();
  if (n.includes('peace')) return 'Damage cover upgrade. Open details to confirm what is and is not included.';
  if (n.includes('9') || n.includes('return')) return 'Later return option for guests who need extra time on their final rental day.';
  if (n.includes('surf')) return 'Rack fitted for carrying a surfboard safely.';
  if (n.includes('bungee')) return 'Extra strap for securing bags or small items.';
  if (n.includes('helmet')) return 'Extra helmet for a second rider.';
  if (n.includes('phone')) return 'Handlebar phone holder for navigation.';
  return 'Optional rental extra. Confirm availability and price before creating the booking.';
}

function isPeaceOfMind(addon: PublicAddon) {
  return addon.name.toLowerCase().includes('peace');
}

function isNinePmReturn(addon: PublicAddon) {
  const name = addon.name.toLowerCase();
  return name.includes('return') && (
    /\b9\s*pm\b/i.test(addon.name) ||
    name.includes('9pm') ||
    name.includes('21:00') ||
    name.includes('ninepm')
  );
}

function hasLeadTime(pickupIso: string) {
  if (!pickupIso) return false;
  const pickup = new Date(pickupIso);
  return !Number.isNaN(pickup.getTime()) && pickup.getTime() - Date.now() >= 2 * 60 * 60 * 1000;
}

function rentalDaysBetween(pickupIso: string, dropoffIso: string) {
  const pickup = new Date(pickupIso);
  const dropoff = new Date(dropoffIso);
  if (
    Number.isNaN(pickup.getTime())
    || Number.isNaN(dropoff.getTime())
    || dropoff.getTime() <= pickup.getTime()
  ) {
    return 1;
  }
  return Math.max(1, Math.ceil((dropoff.getTime() - pickup.getTime()) / MS_PER_DAY));
}

function hasPartnerFreeDelivery(partner: PartnerProfile | undefined) {
  return Boolean(partner && (
    partner.free_delivery ||
    partner.deal_type === 'free_delivery' ||
    partner.deal_type === 'combined' ||
    partner.deal_type === 'commission_delivery' ||
    partner.deal_type === 'discount_delivery'
  ));
}

function isPartnerFreeDeliveryLocation(partner: PartnerProfile | undefined, locationId: number | undefined) {
  if (!hasPartnerFreeDelivery(partner)) return false;
  const ids = partner?.free_delivery_location_ids;
  if (!ids || ids.length === 0) return true;
  return locationId != null && ids.includes(locationId);
}

function locationFeeLabel(
  location: PublicLocation | undefined,
  kind: 'pickup' | 'dropoff',
  partner?: PartnerProfile,
) {
  if (!location) return '';
  if (isPartnerFreeDeliveryLocation(partner, location.id)) return 'Free';
  const value = kind === 'pickup' ? location.deliveryCost : location.collectionCost;
  return value > 0 ? money(value) : 'Free';
}

function VehicleQuoteLine({
  line,
  models,
  pickupDatetime,
  dropoffDatetime,
  pickupLocationId,
  dropoffLocationId,
  addonIds,
  onQuote,
}: {
  line: VehicleLine;
  models: PublicModel[];
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  addonIds: number[];
  onQuote: (id: string, quote: PartnerQuote | null) => void;
}) {
  const quote = usePartnerQuote({
    vehicleModelId: line.vehicleModelId,
    pickupDatetime,
    dropoffDatetime,
    pickupLocationId,
    dropoffLocationId,
    addonIds,
    enabled: hasLeadTime(pickupDatetime),
  });

  useEffect(() => {
    onQuote(line.id, quote.data ?? null);
  }, [line.id, onQuote, quote.data]);

  const model = models.find((m) => m.id === line.vehicleModelId);
  if (!line.vehicleModelId) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-gray-800">{model?.name ?? 'Vehicle'}</span>
        {quote.isLoading ? (
          <span>Pricing...</span>
        ) : quote.data ? (
          <span>
            {quote.data.rentalDays} day{quote.data.rentalDays !== 1 ? 's' : ''} x {money(quote.data.dailyRate)}/day = {money(quote.data.effectiveRentalSubtotal)}
          </span>
        ) : (
          <span className="text-red-600">{quote.error instanceof Error ? quote.error.message : 'No quote yet'}</span>
        )}
      </div>
    </div>
  );
}

export default function PartnerBookPage() {
  const { data: me } = usePartnerMe();
  const storeId = me?.partner.store_id ?? '';
  const models = useQuery({ queryKey: ['partner', 'public-models', storeId], queryFn: () => fetchPublicModels(storeId), enabled: !!storeId });
  const locations = useQuery({ queryKey: ['partner', 'public-locations', storeId], queryFn: () => fetchPublicLocations(storeId), enabled: !!storeId });
  const book = usePartnerBook();
  const locationOptions = locations.data ?? [];
  const storeLocationId = useMemo(() => {
    const rows = locationOptions;
    return rows.find((l) => l.locationType === 'store')?.id ?? rows[0]?.id ?? 1;
  }, [locationOptions]);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerMobile: '',
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
  const [vehicleLines, setVehicleLines] = useState<VehicleLine[]>([
    { id: crypto.randomUUID(), vehicleModelId: '', driverName: '' },
  ]);
  const [quotesByLine, setQuotesByLine] = useState<Record<string, PartnerQuote | null>>({});
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<number>>(() => new Set());
  const [success, setSuccess] = useState<{ groupRef: string; refs: string[] } | null>(null);
  const [error, setError] = useState('');
  const [peaceOpen, setPeaceOpen] = useState(false);

  const firstVehicleModelId = vehicleLines.find((v) => v.vehicleModelId)?.vehicleModelId ?? '';
  const addons = useQuery({
    queryKey: ['partner', 'public-addons', storeId, firstVehicleModelId],
    queryFn: () => fetchPublicAddons(storeId, firstVehicleModelId || undefined),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (!form.accommodationName && me?.partner.name) {
      setForm((prev) => ({ ...prev, accommodationName: me.partner.name }));
    }
  }, [form.accommodationName, me?.partner.name]);

  const pickupLocationId = form.pickupLocationId || storeLocationId;
  const dropoffLocationId = form.dropoffLocationId || storeLocationId;
  const pickupDatetime = toManilaIso(form.pickupDate, form.pickupTime);
  const dropoffDatetime = toManilaIso(form.dropoffDate, form.dropoffTime);
  const leadTimeOk = hasLeadTime(pickupDatetime);
  const ninePmReturnEligible = form.dropoffTime === '16:45';
  const availableAddonIds = useMemo(() => new Set(
    (addons.data ?? [])
      .filter((addon) => ninePmReturnEligible || !isNinePmReturn(addon))
      .map((addon) => Number(addon.id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ), [addons.data, ninePmReturnEligible]);
  const selectedAddonIdList = useMemo(
    () => Array.from(selectedAddonIds).filter((id) => availableAddonIds.size === 0 || availableAddonIds.has(id)),
    [availableAddonIds, selectedAddonIds],
  );
  useEffect(() => {
    if (!addons.data) return;
    setSelectedAddonIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => availableAddonIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [addons.data, availableAddonIds]);
  const pickupLoc = locationOptions.find((l) => l.id === pickupLocationId);
  const dropoffLoc = locationOptions.find((l) => l.id === dropoffLocationId);
  const fallbackPickupFee = pickupLoc ? Number(pickupLoc.deliveryCost) : 0;
  const fallbackDropoffFee = dropoffLoc ? Number(dropoffLoc.collectionCost) : 0;
  const fallbackPickupEffectiveFee = isPartnerFreeDeliveryLocation(me?.partner, pickupLocationId) ? 0 : fallbackPickupFee;
  const fallbackDropoffEffectiveFee = isPartnerFreeDeliveryLocation(me?.partner, dropoffLocationId) ? 0 : fallbackDropoffFee;
  const fallbackDeliveryDiscount =
    (fallbackPickupFee - fallbackPickupEffectiveFee) + (fallbackDropoffFee - fallbackDropoffEffectiveFee);
  const selectedQuotes = vehicleLines.map((line) => quotesByLine[line.id]).filter(Boolean) as PartnerQuote[];
  const selectedVehicleCount = Math.max(1, vehicleLines.filter((line) => line.vehicleModelId).length);
  const summaryRentalDays = selectedQuotes[0]?.rentalDays ?? rentalDaysBetween(pickupDatetime, dropoffDatetime);
  const summaryAddonsTotal = useMemo(() => {
    const addonById = new Map((addons.data ?? []).map((addon) => [Number(addon.id), addon]));
    return selectedAddonIdList.reduce((sum, id) => {
      const addon = addonById.get(id);
      if (!addon) return sum;
      const unitTotal = addon.addonType === 'per_day'
        ? Number(addon.pricePerDay ?? 0) * summaryRentalDays
        : Number(addon.priceOneTime ?? 0);
      return sum + unitTotal * selectedVehicleCount;
    }, 0);
  }, [addons.data, selectedAddonIdList, selectedVehicleCount, summaryRentalDays]);
  const totals = selectedQuotes.reduce(
    (acc, quote, index) => {
      acc.rental += quote.effectiveRentalSubtotal;
      acc.rentalDiscount += quote.rentalDiscount;
      acc.deposit += quote.securityDeposit;
      if (index === 0) {
        acc.pickupOriginal = fallbackPickupFee;
        acc.dropoffOriginal = fallbackDropoffFee;
        acc.pickupEffective = quote.deliveryDiscount > 0 ? quote.effectivePickupFee : fallbackPickupEffectiveFee;
        acc.dropoffEffective = quote.deliveryDiscount > 0 ? quote.effectiveDropoffFee : fallbackDropoffEffectiveFee;
        acc.deliveryDiscount = quote.deliveryDiscount;
      }
      return acc;
    },
    {
      rental: 0,
      rentalDiscount: 0,
      deposit: 0,
      pickupOriginal: fallbackPickupFee,
      dropoffOriginal: fallbackDropoffFee,
      pickupEffective: fallbackPickupEffectiveFee,
      dropoffEffective: fallbackDropoffEffectiveFee,
      deliveryDiscount: fallbackDeliveryDiscount,
    },
  );
  const grandTotal = totals.rental + summaryAddonsTotal + totals.pickupEffective + totals.dropoffEffective;

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateVehicle(id: string, patch: Partial<VehicleLine>) {
    setVehicleLines((prev) => prev.map((line) => line.id === id ? { ...line, ...patch } : line));
    if (patch.vehicleModelId !== undefined) {
      setQuotesByLine((prev) => ({ ...prev, [id]: null }));
    }
  }

  function addVehicleLine() {
    setVehicleLines((prev) => [...prev, { id: crypto.randomUUID(), vehicleModelId: '', driverName: '' }]);
  }

  function removeVehicleLine(id: string) {
    setVehicleLines((prev) => prev.length === 1 ? prev : prev.filter((line) => line.id !== id));
    setQuotesByLine((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleAddon(id: number) {
    const addon = (addons.data ?? []).find((row) => Number(row.id) === id);
    if (addon && isNinePmReturn(addon) && !ninePmReturnEligible) return;
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function feeDisplay(original: number, effective: number) {
    if (original > 0 && effective === 0) return 'Free';
    return money(effective);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!leadTimeOk) {
      setError('Pickup must be at least 2 hours from now.');
      return;
    }
    const vehicles = vehicleLines
      .filter((line) => line.vehicleModelId)
      .map((line) => ({ vehicleModelId: line.vehicleModelId, driverName: line.driverName.trim() || form.customerName.trim() }));
    if (vehicles.length === 0) {
      setError('Select at least one vehicle.');
      return;
    }
    try {
      const body: PartnerBookingInput = {
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerMobile: form.customerMobile.trim(),
        vehicleModelId: vehicles[0].vehicleModelId,
        vehicles,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId,
        dropoffLocationId,
        addonIds: selectedAddonIdList,
        accommodationName: form.accommodationName.trim() || me?.partner.name || undefined,
        roomReference: form.roomReference.trim() || undefined,
        extraComments: form.extraComments.trim() || undefined,
      };
      const result = await book.mutateAsync(body);
      setSuccess({ groupRef: result.groupRef, refs: result.bookings.map((b) => b.orderReference) });
      setForm((prev) => ({ ...prev, customerName: '', customerEmail: '', customerMobile: '', roomReference: '', extraComments: '' }));
      setVehicleLines([{ id: crypto.randomUUID(), vehicleModelId: '', driverName: '' }]);
      setSelectedAddonIds(new Set());
      setQuotesByLine({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={handleSubmit} className="rounded-lg bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Book for a Guest</h1>
        <p className="mt-1 text-sm text-gray-500">This booking will be automatically attributed to {me?.partner.name ?? 'your partner account'}.</p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
            <label className="mb-1 block text-xs font-semibold text-gray-500">Accommodation / room reference</label>
            <input value={form.roomReference} onChange={(e) => set('roomReference', e.target.value)} placeholder="Room 12, front desk guest, etc." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Pickup</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input required type="date" value={form.pickupDate} onChange={(e) => set('pickupDate', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select required value={form.pickupTime} onChange={(e) => set('pickupTime', e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {BOOKING_TIMES.map((time) => {
                  const disabled = !hasLeadTime(toManilaIso(form.pickupDate, time));
                  return <option key={time} value={time} disabled={disabled}>{time}{disabled ? ' - too soon' : ''}</option>;
                })}
              </select>
            </div>
            {!leadTimeOk && <p className="mt-1 text-xs font-semibold text-red-600">Partner bookings need at least 2 hours notice.</p>}
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
            <select value={pickupLocationId} onChange={(e) => set('pickupLocationId', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name} - delivery {locationFeeLabel(l, 'pickup', me?.partner)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Return location</label>
            <select value={dropoffLocationId} onChange={(e) => set('dropoffLocationId', Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name} - collection {locationFeeLabel(l, 'dropoff', me?.partner)}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500">Vehicles and drivers</p>
            <button type="button" onClick={addVehicleLine} className="inline-flex items-center gap-1 rounded-lg border border-teal-600 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
              <Plus className="h-3.5 w-3.5" /> Add vehicle
            </button>
          </div>
          <div className="space-y-3">
            {vehicleLines.map((line, index) => (
              <div key={line.id} className="rounded-lg border border-gray-200 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Vehicle {index + 1}</label>
                    <select required value={line.vehicleModelId} onChange={(e) => updateVehicle(line.id, { vehicleModelId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <option value="">Select vehicle</option>
                      {(models.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.minDailyRate ? ` from ${money(m.minDailyRate)}/day` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Driver name</label>
                    <input value={line.driverName} onChange={(e) => updateVehicle(line.id, { driverName: e.target.value })} placeholder={form.customerName || 'Defaults to guest name'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <button type="button" onClick={() => removeVehicleLine(line.id)} disabled={vehicleLines.length === 1} className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40" aria-label="Remove vehicle">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3">
                  <VehicleQuoteLine
                    line={line}
                    models={models.data ?? []}
                    pickupDatetime={pickupDatetime}
                    dropoffDatetime={dropoffDatetime}
                    pickupLocationId={pickupLocationId}
                    dropoffLocationId={dropoffLocationId}
                    addonIds={selectedAddonIdList}
                    onQuote={(id, quote) => setQuotesByLine((prev) => prev[id] === quote ? prev : { ...prev, [id]: quote })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold text-gray-500">Add-ons</p>
          {addons.isLoading ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-400">Loading add-ons...</div>
          ) : (addons.data ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {(addons.data ?? []).map((addon) => {
                const id = Number(addon.id);
                const ninePmDisabled = isNinePmReturn(addon) && !ninePmReturnEligible;
                return (
                  <label key={addon.id} className={`flex items-start gap-3 rounded-lg border border-gray-200 p-3 ${ninePmDisabled ? 'cursor-not-allowed bg-gray-50 opacity-60' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      checked={selectedAddonIds.has(id)}
                      disabled={ninePmDisabled}
                      onChange={() => toggleAddon(id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{addon.name}</span>
                      <span className="block text-xs text-gray-500">{addonPrice(addon)}</span>
                      <span className="mt-1 block text-xs text-gray-500">{addonDescription(addon.name)}</span>
                      {ninePmDisabled && (
                        <span className="mt-1 block text-xs font-semibold text-amber-700">
                          Only available with a 4:45pm return time.
                        </span>
                      )}
                      {isPeaceOfMind(addon) && (
                        <button type="button" onClick={(e) => { e.preventDefault(); setPeaceOpen(true); }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 underline">
                          <Info className="h-3.5 w-3.5" /> More info
                        </button>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">No add-ons available.</div>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Accommodation name</label>
            <input value={form.accommodationName} onChange={(e) => set('accommodationName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <input value={form.extraComments} onChange={(e) => set('extraComments', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-5">
          {success && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">Booking group {success.groupRef}: {success.refs.join(', ')}</p>}
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={book.isPending || !leadTimeOk} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {book.isPending ? 'Creating booking...' : 'Create booking'}
          </button>
        </div>
      </form>

      <aside className="h-fit rounded-lg bg-white p-4 shadow-sm lg:sticky lg:top-6">
        <h2 className="text-sm font-bold text-gray-900">Price summary</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><span className="text-gray-500">Rental total</span><span className="font-semibold">{money(totals.rental)}</span></div>
          {totals.rentalDiscount > 0 && <div className="flex justify-between gap-4 text-teal-700"><span>Partner rental discount</span><span>-{money(totals.rentalDiscount)}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-gray-500">Add-ons</span><span className="font-semibold">{money(summaryAddonsTotal)}</span></div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Delivery</span>
            <span className="font-semibold">
              {totals.pickupOriginal > totals.pickupEffective && <span className="mr-2 text-gray-400 line-through">{money(totals.pickupOriginal)}</span>}
              {feeDisplay(totals.pickupOriginal, totals.pickupEffective)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Collection</span>
            <span className="font-semibold">
              {totals.dropoffOriginal > totals.dropoffEffective && <span className="mr-2 text-gray-400 line-through">{money(totals.dropoffOriginal)}</span>}
              {feeDisplay(totals.dropoffOriginal, totals.dropoffEffective)}
            </span>
          </div>
          {totals.deliveryDiscount > 0 && <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">Free delivery discount applied: {money(totals.deliveryDiscount)}</p>}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex justify-between gap-4 text-base"><span className="font-bold text-gray-900">Guest total</span><span className="font-bold text-teal-700">{money(grandTotal)}</span></div>
            <div className="mt-2 flex justify-between gap-4"><span className="text-gray-500">Refundable deposit</span><span className="font-semibold">{money(totals.deposit)}</span></div>
          </div>
        </div>
      </aside>

      <PeaceOfMindModal open={peaceOpen} onClose={() => setPeaceOpen(false)} />
    </div>
  );
}
