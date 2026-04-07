import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateWalkIn } from '../../api/orders-raw.js';
import { useLocations, useAddons } from '../../api/config.js';
import { useAvailableVehicles } from '../../api/fleet.js';
import { useUIStore } from '../../stores/ui-store.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Location { id: number; name: string; }

interface Addon {
  id: number;
  name: string;
  pricePerDay: number;
  priceOneTime: number;
  addonType: 'per_day' | 'one_time';
  applicableModelIds: string[] | null;
  mutualExclusivityGroup: string | null;
  isActive: boolean;
}

interface QuoteBreakdown {
  rentalDays: number;
  dailyRate: number;
  rentalSubtotal: number;
  addonsTotal: number;
  grandTotal: number;
  securityDeposit: number;
  pickupFee: number;
  dropoffFee: number;
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;

const TIME_SLOTS = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
];

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const INPUT_CLS =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-lato focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const SELECT_CLS =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-lato focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const SECTION_HDR_CLS =
  'mb-3 font-lato text-xs font-semibold uppercase tracking-widest text-gray-400';
const LABEL_CLS = 'font-lato text-sm font-medium text-gray-700';

export function WalkInBookingModal({ open, onClose }: Props) {
  const createWalkIn = useCreateWalkIn();
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';

  // ── Form state ──
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [pickupDate, setPickupDate] = useState(todayDate());
  const [pickupTime, setPickupTime] = useState('09:15');
  const [dropoffDate, setDropoffDate] = useState(todayDate());
  const [dropoffTime, setDropoffTime] = useState('09:15');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [dropoffLocationId, setDropoffLocationId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleModelId, setVehicleModelId] = useState('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, number>>({});
  const [staffNotes, setStaffNotes] = useState('');

  // ── Success state ──
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // ── Quote state ──
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // ── Derived datetimes ──
  const pickupDatetime =
    pickupDate && pickupTime ? `${pickupDate}T${pickupTime}:00` : '';
  const dropoffDatetime =
    dropoffDate && dropoffTime ? `${dropoffDate}T${dropoffTime}:00` : '';

  // ── Data hooks ──
  const { data: locations } = useLocations(storeId) as { data: Location[] | undefined };
  const { data: addonsRaw = [] } = useAddons(storeId) as { data: Addon[] };
  const { data: availableVehicles = [], isLoading: vehiclesLoading } =
    useAvailableVehicles(storeId, pickupDatetime, dropoffDatetime);

  // ── Filtered addons for selected model ──
  const filteredAddons = (addonsRaw as Addon[]).filter((a) => {
    if (!a.isActive) return false;
    const addonName = a.name.toLowerCase();
    const modelId = vehicleModelId.toLowerCase();
    // TukTuk addons only show for TukTuk models
    if (addonName.includes('tuktuk') || addonName.includes('tuk tuk')) {
      return modelId.includes('tuktuk') || modelId.includes('tuk');
    }
    // Scooter addons only show for non-TukTuk models
    if (addonName.includes('scooter')) {
      return !modelId.includes('tuktuk') && !modelId.includes('tuk');
    }
    // All other addons (9PM Return, Bungee Cord, Surf Rack) show for all
    return true;
  });

  // ── Quote fetch ──
  useEffect(() => {
    if (!vehicleModelId || !pickupDatetime || !dropoffDatetime || !storeId) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');
    const addonIds = Object.entries(selectedAddonIds)
      .filter(([, qty]) => qty > 0)
      .map(([id]) => id)
      .join(',');
    const url =
      `${apiBase}/api/public/booking/quote` +
      `?storeId=${storeId}` +
      `&vehicleModelId=${vehicleModelId}` +
      `&pickupDatetime=${encodeURIComponent(pickupDatetime)}` +
      `&dropoffDatetime=${encodeURIComponent(dropoffDatetime)}` +
      `&pickupLocationId=${pickupLocationId || ''}` +
      `&dropoffLocationId=${dropoffLocationId || ''}` +
      (addonIds ? `&addonIds=${addonIds}` : '');
    fetch(url)
      .then((r) => r.json())
      .then((d: { data?: QuoteBreakdown }) => { setQuote(d.data ?? null); })
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, [vehicleModelId, pickupDatetime, dropoffDatetime, storeId,
    pickupLocationId, dropoffLocationId, selectedAddonIds]);

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setCustomerName(''); setCustomerMobile(''); setCustomerEmail('');
      setPickupDate(todayDate()); setPickupTime('09:15');
      setDropoffDate(todayDate()); setDropoffTime('09:15');
      setPickupLocationId(''); setDropoffLocationId('');
      setSelectedVehicleId(''); setVehicleModelId('');
      setSelectedAddonIds({});
      setStaffNotes('');
      setCreatedRef(null); setCopiedLink(false);
      setQuote(null); setQuoteLoading(false);
      createWalkIn.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ──
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createWalkIn.mutate(
      {
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        customerEmail: customerEmail.trim() || undefined,
        vehicleModelId,
        storeId,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId: pickupLocationId ? Number(pickupLocationId) : undefined,
        dropoffLocationId: dropoffLocationId ? Number(dropoffLocationId) : undefined,
        staffNotes: staffNotes.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setCreatedRef(data.order_reference ?? data.id);
        },
      },
    );
  }

  const isValid =
    customerName.trim() && customerMobile.trim() &&
    storeId && vehicleModelId &&
    pickupDate && pickupTime &&
    dropoffDate && dropoffTime;

  // ── Confirmation / share ──
  const confirmationLink = createdRef ? `${SITE_URL}/book/confirmation/${createdRef}` : '';

  function handleCopyLink() {
    void navigator.clipboard.writeText(confirmationLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const waText = encodeURIComponent(
    `Hi ${customerName}! Your booking at Lola's Rentals is confirmed. Reference: ${createdRef}. View details: ${confirmationLink}`,
  );
  const rawMobile = customerMobile.replace(/\D/g, '');
  const waMobile = rawMobile.startsWith('0') ? `63${rawMobile.slice(1)}` : rawMobile;
  const waUrl = `https://wa.me/${waMobile}?text=${waText}`;

  // ── Addon stepper ──
  function setAddonQty(addonId: number, qty: number) {
    setSelectedAddonIds((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[String(addonId)];
      } else {
        next[String(addonId)] = Math.min(qty, 10);
      }
      return next;
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Walk-in Booking" size="lg">
      {createdRef ? (
        /* ── Success state (unchanged) ── */
        <div className="space-y-5">
          <div className="rounded-xl bg-green-50 px-5 py-4 text-center">
            <p className="font-lato text-sm font-semibold uppercase tracking-widest text-green-600">Booking Created!</p>
            <p className="mt-2 font-lato text-3xl font-black tracking-wide text-gray-900">{createdRef}</p>
            <p className="mt-1 font-lato text-sm text-gray-500">
              Walk-in booking for <span className="font-medium text-gray-700">{customerName}</span>
            </p>
          </div>

          <div>
            <p className="mb-2 font-lato text-sm font-semibold text-gray-700">Share with customer</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-gray-600">{confirmationLink}</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1 font-lato text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {copiedLink ? '✓ Copied!' : 'Copy link'}
                </button>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 font-lato text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send via WhatsApp
              </a>
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 font-lato text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        /* ── Form ── */
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Section 1: Customer ── */}
          <section>
            <h3 className={SECTION_HDR_CLS}>Customer</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={LABEL_CLS}>Full name <span className="text-red-500">*</span></span>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className={INPUT_CLS}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Mobile <span className="text-red-500">*</span></span>
                <input
                  type="tel"
                  required
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="e.g. 09171234567"
                  className={INPUT_CLS}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Email <span className="font-lato text-xs text-gray-400">(optional)</span></span>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. maria@example.com"
                  className={INPUT_CLS}
                />
              </label>
            </div>
          </section>

          {/* ── Section 2: Dates & Times ── */}
          <section>
            <h3 className={SECTION_HDR_CLS}>Dates &amp; Times</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Pickup */}
              <div className="block">
                <span className={LABEL_CLS}>Pickup date <span className="text-red-500">*</span></span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    required
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    required
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Return */}
              <div className="block">
                <span className={LABEL_CLS}>Return date <span className="text-red-500">*</span></span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    required
                    value={dropoffDate}
                    onChange={(e) => setDropoffDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    required
                    value={dropoffTime}
                    onChange={(e) => setDropoffTime(e.target.value)}
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: Vehicle ── */}
          {pickupDatetime && dropoffDatetime && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Vehicle</h3>
              {vehiclesLoading ? (
                <p className="font-lato text-sm text-gray-400">Checking availability…</p>
              ) : availableVehicles.length === 0 ? (
                <p className="font-lato text-sm text-amber-600">No vehicles available for selected dates.</p>
              ) : (
                <label className="block">
                  <span className={LABEL_CLS}>Available vehicle <span className="text-red-500">*</span></span>
                  <select
                    required
                    value={selectedVehicleId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedVehicleId(id);
                      const v = availableVehicles.find((v) => v.id === id);
                      setVehicleModelId(v?.modelId ?? '');
                      setSelectedAddonIds({});
                      setQuote(null);
                    }}
                    className={SELECT_CLS}
                  >
                    <option value="">Select vehicle…</option>
                    {[...availableVehicles]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                  </select>
                </label>
              )}
            </section>
          )}

          {/* ── Section 4: Locations ── */}
          {storeId && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Locations</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL_CLS}>Pickup location <span className="font-lato text-xs text-gray-400">(optional)</span></span>
                  <select
                    value={pickupLocationId}
                    onChange={(e) => setPickupLocationId(e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">— none —</option>
                    {(locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Return location <span className="font-lato text-xs text-gray-400">(optional)</span></span>
                  <select
                    value={dropoffLocationId}
                    onChange={(e) => setDropoffLocationId(e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">— none —</option>
                    {(locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          {/* ── Section 5: Add-ons ── */}
          {vehicleModelId && filteredAddons.length > 0 && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Add-ons</h3>
              <div className="space-y-2">
                {filteredAddons.map((addon) => {
                  const qty = selectedAddonIds[String(addon.id)] ?? 0;
                  const price = addon.addonType === 'per_day' ? addon.pricePerDay : addon.priceOneTime;
                  const priceLabel = addon.addonType === 'per_day' ? '/day' : ' one-time';
                  return (
                    <div key={addon.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-lato text-sm font-medium text-gray-800">{addon.name}</p>
                        <p className="font-lato text-xs text-gray-500">{formatCurrency(price)}{priceLabel}</p>
                      </div>
                      <div className="ml-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAddonQty(addon.id, qty - 1)}
                          disabled={qty === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white font-lato text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-lato text-sm font-medium text-gray-800">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setAddonQty(addon.id, qty + 1)}
                          disabled={qty >= 10}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white font-lato text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Section 6: Price Summary ── */}
          {(quoteLoading || quote) && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Price Summary</h3>
              {quoteLoading ? (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-gray-200" />
                  ))}
                </div>
              ) : quote ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">
                        Rental ({quote.rentalDays} {quote.rentalDays === 1 ? 'day' : 'days'} @ {formatCurrency(quote.dailyRate)}/day)
                      </span>
                      <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.rentalSubtotal)}</span>
                    </div>
                    {quote.pickupFee > 0 && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Pickup fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.pickupFee)}</span>
                      </div>
                    )}
                    {quote.dropoffFee > 0 && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Dropoff fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.dropoffFee)}</span>
                      </div>
                    )}
                    {quote.addonsTotal > 0 && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Add-ons</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.addonsTotal)}</span>
                      </div>
                    )}
                    <div className="my-2 border-t border-gray-300" />
                    <div className="flex justify-between">
                      <span className="font-lato text-sm font-semibold text-gray-900">Total</span>
                      <span className="font-lato text-sm font-bold text-gray-900">{formatCurrency(quote.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">
                        Security deposit <span className="text-xs text-gray-400">(refundable)</span>
                      </span>
                      <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.securityDeposit)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {/* ── Section 7: Notes ── */}
          <section>
            <h3 className={SECTION_HDR_CLS}>Notes</h3>
            <label className="block">
              <span className={LABEL_CLS}>Staff notes <span className="font-lato text-xs text-gray-400">(optional)</span></span>
              <textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Customer prefers morning pickup. Paid cash deposit."
                className={INPUT_CLS}
              />
            </label>
          </section>

          {createWalkIn.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 font-lato text-sm text-red-600">
              {(createWalkIn.error as Error).message}
            </p>
          )}

          {/* ── Footer ── */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 font-lato text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || createWalkIn.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 font-lato text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createWalkIn.isPending ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
