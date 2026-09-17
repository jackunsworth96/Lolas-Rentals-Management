import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
  fetchPublicAddons,
  fetchPublicLocations,
  fetchPublicModelPricing,
  fetchPublicModels,
  usePartnerMe,
  usePartnerQuote,
  type PublicAddon,
} from '../../api/partner-portal.js';
import { PeaceOfMindModal } from '../../components/basket/PeaceOfMindModal.js';

const BOOKING_TIMES = ['09:15', '10:15', '11:15', '12:15', '13:15', '14:15', '15:15', '16:45'];

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

function addonPrice(addon: PublicAddon) {
  return addon.addonType === 'per_day'
    ? `${money(addon.pricePerDay)}/day`
    : `${money(addon.priceOneTime)} one-time`;
}

function addonDescription(name: string) {
  const n = name.toLowerCase();
  if (n.includes('peace')) return 'Damage cover upgrade. Use details for inclusions and exclusions.';
  if (n.includes('surf')) return 'Rack fitted for carrying a surfboard safely.';
  if (n.includes('helmet')) return 'Extra helmet for a second rider.';
  if (n.includes('phone')) return 'Handlebar phone holder for navigation.';
  if (n.includes('bungee')) return 'Extra strap for bags or small items.';
  return 'Optional rental extra available when suitable for the vehicle.';
}

export default function PartnerPricesPage() {
  const { data: me } = usePartnerMe();
  const storeId = me?.partner.store_id ?? '';
  const models = useQuery({ queryKey: ['partner', 'price-models', storeId], queryFn: () => fetchPublicModels(storeId), enabled: !!storeId });
  const locations = useQuery({ queryKey: ['partner', 'price-locations', storeId], queryFn: () => fetchPublicLocations(storeId), enabled: !!storeId });
  const addons = useQuery({ queryKey: ['partner', 'price-addons', storeId], queryFn: () => fetchPublicAddons(storeId), enabled: !!storeId });
  const [modelId, setModelId] = useState('');
  const [pickupDate, setPickupDate] = useState(() => manilaDate(24));
  const [pickupTime, setPickupTime] = useState('09:15');
  const [dropoffDate, setDropoffDate] = useState(() => manilaDate(72));
  const [dropoffTime, setDropoffTime] = useState('16:45');
  const [peaceOpen, setPeaceOpen] = useState(false);
  const locationRows = locations.data ?? [];
  const defaultLocationId = useMemo(() => locationRows.find((l) => l.locationType === 'store')?.id ?? locationRows[0]?.id ?? 1, [locationRows]);
  const pricing = useQuery({
    queryKey: ['partner', 'model-pricing', storeId, modelId],
    queryFn: () => fetchPublicModelPricing(storeId, modelId),
    enabled: !!storeId && !!modelId,
  });
  const quote = usePartnerQuote({
    vehicleModelId: modelId,
    pickupDatetime: toManilaIso(pickupDate, pickupTime),
    dropoffDatetime: toManilaIso(dropoffDate, dropoffTime),
    pickupLocationId: defaultLocationId,
    dropoffLocationId: defaultLocationId,
    enabled: !!modelId && !!defaultLocationId,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Price Guide</h1>
        <p className="mt-1 text-sm text-gray-500">Quick reference for answering guest inquiries.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:col-span-2">
            <option value="">Select vehicle for final rate</option>
            {(models.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {BOOKING_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={dropoffDate} onChange={(e) => setDropoffDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {BOOKING_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {modelId && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
            {quote.isLoading ? (
              <p className="text-teal-700">Calculating final rate...</p>
            ) : quote.data ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <div><p className="text-xs text-teal-700">Final day rate</p><p className="font-bold">{money(quote.data.dailyRate)}</p></div>
                <div><p className="text-xs text-teal-700">Rental total</p><p className="font-bold">{money(quote.data.effectiveRentalSubtotal)}</p></div>
                <div><p className="text-xs text-teal-700">Guest total</p><p className="font-bold">{money(quote.data.grandTotal)}</p></div>
                <div><p className="text-xs text-teal-700">Deposit</p><p className="font-bold">{money(quote.data.securityDeposit)}</p></div>
              </div>
            ) : (
              <p className="text-red-700">{quote.error instanceof Error ? quote.error.message : 'Choose a valid quote window.'}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Vehicle Rate Tiers</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr><th className="px-3 py-2 text-left">Vehicle</th><th className="px-3 py-2 text-left">Duration</th><th className="px-3 py-2 text-right">Rate</th></tr>
            </thead>
            <tbody>
              {!modelId && (models.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold">{m.name}</td>
                  <td className="px-3 py-2 text-gray-500">Lowest configured rate</td>
                  <td className="px-3 py-2 text-right font-semibold">{m.minDailyRate ? `from ${money(m.minDailyRate)}/day` : '-'}</td>
                </tr>
              ))}
              {modelId && (pricing.data ?? []).map((tier) => (
                <tr key={tier.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold">{models.data?.find((m) => m.id === modelId)?.name ?? modelId}</td>
                  <td className="px-3 py-2 text-gray-500">{tier.minDays}-{tier.maxDays} days</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(tier.dailyRate)}/day</td>
                </tr>
              ))}
              {modelId && !pricing.isLoading && (pricing.data ?? []).length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">No pricing tiers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Delivery and Collection</h2>
          <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {locationRows.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-800">{l.name}</span>
                <span className="text-gray-500">Delivery {l.deliveryCost > 0 ? money(l.deliveryCost) : 'Free'}</span>
                <span className="text-gray-500">Collection {l.collectionCost > 0 ? money(l.collectionCost) : 'Free'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Add-ons</h2>
          <div className="mt-3 space-y-2">
            {(addons.data ?? []).map((addon) => (
              <div key={addon.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{addon.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{addonDescription(addon.name)}</p>
                  </div>
                  <p className="shrink-0 font-semibold text-teal-700">{addonPrice(addon)}</p>
                </div>
                {addon.name.toLowerCase().includes('peace') && (
                  <button type="button" onClick={() => setPeaceOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 underline">
                    <Info className="h-3.5 w-3.5" /> Peace of Mind details
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      <PeaceOfMindModal open={peaceOpen} onClose={() => setPeaceOpen(false)} />
    </div>
  );
}
