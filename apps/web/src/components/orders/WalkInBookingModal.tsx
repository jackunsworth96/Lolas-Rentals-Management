import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateWalkInDirect } from '../../api/orders-raw.js';
import { useLocations, useAddons } from '../../api/config.js';
import { useAvailableVehicles } from '../../api/fleet.js';
import { useUIStore } from '../../stores/ui-store.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Location {
  id: number;
  name: string;
  deliveryCost?: number;
  collectionCost?: number;
}

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
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/** Snaps current wall-clock time to the nearest TIME_SLOT (min absolute diff). */
function nearestTimeSlot(): string {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let best = TIME_SLOTS[0];
  let bestDiff = Infinity;
  for (const slot of TIME_SLOTS) {
    const [h, m] = slot.split(':').map(Number) as [number, number];
    const diff = Math.abs(h * 60 + m - nowMins);
    if (diff < bestDiff) { bestDiff = diff; best = slot; }
  }
  return best;
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
  const createWalkInDirect = useCreateWalkInDirect();
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
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [depositPaid, setDepositPaid] = useState(true);  // mandatory by default; staff can waive
  const [depositMethod, setDepositMethod] = useState('cash');
  const [nationality, setNationality] = useState('');
  const [helmetNumbers, setHelmetNumbers] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);

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

  // ── Auto-set pickup/dropoff to the store's own location (zero-fee) ──
  // Runs only when the modal opens (or storeId changes) AND both location IDs
  // are still empty — so React Query refetches never override the user's
  // manual location selection.
  useEffect(() => {
    if (!open) return;
    if (!locations || locations.length === 0) return;
    // Don't clobber a location the user has already chosen
    if (pickupLocationId !== '' || dropoffLocationId !== '') return;
    const storeLoc = (locations as Array<Location & {
      delivery_cost?: number;
      collection_cost?: number;
    }>).find((l) => {
      const dc = Number(l.deliveryCost ?? l.delivery_cost ?? 1);
      const cc = Number(l.collectionCost ?? l.collection_cost ?? 1);
      return dc === 0 && cc === 0;
    });
    if (storeLoc) {
      setPickupLocationId(String(storeLoc.id));
      setDropoffLocationId(String(storeLoc.id));
    } else {
      // Fallback: use first available location so quote fetch is not blocked
      const firstLoc = (locations as Array<{ id: number }>)[0];
      if (firstLoc) {
        setPickupLocationId(String(firstLoc.id));
        setDropoffLocationId(String(firstLoc.id));
      }
    }
  // pickupLocationId/dropoffLocationId intentionally omitted: we only want
  // this to run on open/storeId/locations changes, not on every user click.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locations, storeId]);

  // ── Local fee computation — derived directly from locations/addons data ──
  // These update instantly on selection change without waiting for the quote API.
  type LocExtended = Location & { delivery_cost?: number; collection_cost?: number };
  const locsExtended = (locations ?? []) as LocExtended[];
  const pickupLoc = locsExtended.find((l) => String(l.id) === pickupLocationId);
  const dropoffLoc = locsExtended.find((l) => String(l.id) === dropoffLocationId);
  const pickupFeeLocal = Number(pickupLoc?.deliveryCost ?? pickupLoc?.delivery_cost ?? 0);
  const dropoffFeeLocal = Number(dropoffLoc?.collectionCost ?? dropoffLoc?.collection_cost ?? 0);
  const localRentalDays =
    pickupDatetime && dropoffDatetime
      ? Math.max(
          1,
          Math.ceil(
            (new Date(dropoffDatetime).getTime() - new Date(pickupDatetime).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 1;

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

  const addonsTotalLocal = filteredAddons.reduce((sum, addon) => {
    const qty = selectedAddonIds[String(addon.id)] ?? 0;
    if (!qty) return sum;
    const unitCost =
      addon.addonType === 'per_day'
        ? addon.pricePerDay * localRentalDays
        : addon.priceOneTime;
    return sum + unitCost * qty;
  }, 0);

  // Grand total = server rental base + locally-computed fees (so fees appear immediately)
  const grandTotalLocal =
    (quote?.rentalSubtotal ?? 0) + pickupFeeLocal + dropoffFeeLocal + addonsTotalLocal;

  // ── Quote fetch ──
  // Stable serialisation of selectedAddonIds so the effect only re-runs
  // when the actual addon selection changes, not on every object reference.
  const addonIdsKey = JSON.stringify(selectedAddonIds);

  useEffect(() => {
    // Guard: all required fields must be present, including location IDs
    // (backend schema requires positive integers for both — empty string → 400)
    if (!vehicleModelId || !pickupDatetime || !dropoffDatetime || !storeId
        || !pickupLocationId || !dropoffLocationId) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }
    // AbortController ensures only the LATEST fetch's result is applied.
    // Without this, an older fetch (base params) can resolve after a newer
    // one (with delivery fee or addons), silently overwriting the updated
    // quote and making fees/addon costs disappear.
    const controller = new AbortController();
    setQuoteLoading(true);
    const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');
    const parsed: Record<string, number> = JSON.parse(addonIdsKey) as Record<string, number>;
    const selectedAddonIdsList = Object.entries(parsed)
      .filter(([, qty]) => qty > 0)
      .flatMap(([id, qty]) => Array(qty).fill(Number(id)) as number[]);
    const addonParams = selectedAddonIdsList
      .map((id) => `addonIds=${id}`)
      .join('&');
    const url =
      `${apiBase}/public/booking/quote` +
      `?storeId=${storeId}` +
      `&vehicleModelId=${vehicleModelId}` +
      `&pickupDatetime=${encodeURIComponent(pickupDatetime)}` +
      `&dropoffDatetime=${encodeURIComponent(dropoffDatetime)}` +
      `&pickupLocationId=${pickupLocationId}` +
      `&dropoffLocationId=${dropoffLocationId}` +
      (selectedAddonIdsList.length > 0 ? `&${addonParams}` : '');
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { data?: QuoteBreakdown }) => {
        // Only overwrite the quote when the server returned valid data.
        // If the response is an error envelope (no data field), keep the
        // existing quote visible so the UI doesn't blank out.
        if (d.data) setQuote(d.data);
      })
      .catch((err: unknown) => {
        // Ignore aborted fetches — a newer fetch is already running.
        if ((err as Error).name !== 'AbortError') {
          /* keep existing quote visible on other errors */
        }
      })
      .finally(() => setQuoteLoading(false));
    // Cleanup: abort the in-flight fetch when deps change or component unmounts
    return () => controller.abort();
  }, [vehicleModelId, pickupDatetime, dropoffDatetime, storeId,
    pickupLocationId, dropoffLocationId, addonIdsKey]);

  // ── Auto-set deposit amount from quote ──
  useEffect(() => {
    if (quote?.securityDeposit) {
      setDepositAmount(quote.securityDeposit);
    }
  }, [quote?.securityDeposit]);

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
      setPaymentMethod('cash');
      setDepositPaid(true);
      setDepositMethod('cash');
      setNationality('');
      setHelmetNumbers('');
      setDepositAmount(0);
      setCreatedRef(null); setCopiedLink(false);
      setQuote(null); setQuoteLoading(false);
      createWalkInDirect.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ──
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selectedVehicle = (availableVehicles ?? []).find((v) => v.id === selectedVehicleId);
    createWalkInDirect.mutate(
      {
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        customerEmail: customerEmail.trim() || undefined,
        nationality: nationality.trim() || undefined,
        storeId,
        vehicleId: selectedVehicleId,
        vehicleModelId,
        vehicleName: selectedVehicle?.name ?? vehicleModelId,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId: pickupLocationId ? Number(pickupLocationId) : undefined,
        dropoffLocationId: dropoffLocationId ? Number(dropoffLocationId) : undefined,
        addonIds: Object.entries(selectedAddonIds)
          .filter(([, qty]) => qty > 0)
          .map(([id]) => Number(id)),
        helmetNumbers: helmetNumbers.trim() || undefined,
        staffNotes: staffNotes.trim() || undefined,
        paymentMethod: paymentMethod as 'cash' | 'gcash' | 'card' | 'bank_transfer',
        depositCollected: depositPaid,
        depositAmount: depositPaid ? depositAmount : 0,
        depositMethod: depositMethod as 'cash' | 'gcash' | 'card' | 'bank_transfer',
        grandTotal: grandTotalLocal,
        rentalDays: quote?.rentalDays ?? localRentalDays,
        dailyRate: quote?.dailyRate ?? 0,
        pickupFee: pickupFeeLocal,
        dropoffFee: dropoffFeeLocal,
      },
      {
        onSuccess: (data) => {
          setCreatedRef(data.orderReference ?? data.orderId);
        },
      },
    );
  }

  const isValid =
    customerName.trim() && customerMobile.trim() &&
    storeId && vehicleModelId && selectedVehicleId &&
    pickupDate && pickupTime &&
    dropoffDate && dropoffTime &&
    pickupLocationId && dropoffLocationId;

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
            <p className="font-lato text-sm font-semibold uppercase tracking-widest text-green-600">Booking Activated!</p>
            <p className="mt-2 font-lato text-3xl font-black tracking-wide text-gray-900">{createdRef}</p>
            <p className="mt-1 font-lato text-sm text-gray-500">
              Walk-in booking for <span className="font-medium text-gray-700">{customerName}</span> is now active.
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
              <label className="block sm:col-span-2">
                <span className={LABEL_CLS}>
                  Nationality
                  <span className="ml-1 font-lato text-xs text-gray-400">(optional)</span>
                </span>
                <input
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="e.g. Australian, Filipino, German"
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
                  <div className="flex flex-1 flex-col gap-1">
                    <input
                      type="date"
                      required
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPickupDate(todayDate())}
                      className="self-start rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-lato text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                    >
                      Today
                    </button>
                  </div>
                  <div className="flex w-28 flex-col gap-1">
                    <select
                      required
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {TIME_SLOTS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPickupTime(nearestTimeSlot())}
                      className="self-start rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-lato text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                    >
                      Now
                    </button>
                  </div>
                </div>
              </div>

              {/* Return */}
              <div className="block">
                <span className={LABEL_CLS}>Return date <span className="text-red-500">*</span></span>
                <div className="mt-1 flex gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <input
                      type="date"
                      required
                      value={dropoffDate}
                      onChange={(e) => setDropoffDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        // Always base off pickup date; if return is already ahead of
                        // pickup (user pressed before), increment from there instead.
                        const base =
                          dropoffDate && dropoffDate > (pickupDate || todayDate())
                            ? dropoffDate
                            : (pickupDate || todayDate());
                        const d = new Date(`${base}T00:00:00`);
                        d.setDate(d.getDate() + 1);
                        const y = d.getFullYear();
                        const mo = String(d.getMonth() + 1).padStart(2, '0');
                        const dy = String(d.getDate()).padStart(2, '0');
                        setDropoffDate(`${y}-${mo}-${dy}`);
                      }}
                      className="self-start rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-lato text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                    >
                      +1 Day
                    </button>
                  </div>
                  <div className="flex w-28 flex-col gap-1">
                    <select
                      required
                      value={dropoffTime}
                      onChange={(e) => setDropoffTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-lato text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {TIME_SLOTS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDropoffTime(nearestTimeSlot())}
                      className="self-start rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-lato text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                    >
                      Now
                    </button>
                  </div>
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
                <>
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
                  <label className="mt-3 block">
                    <span className={LABEL_CLS}>
                      Helmet numbers
                      <span className="ml-1 font-lato text-xs text-gray-400">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={helmetNumbers}
                      onChange={(e) => setHelmetNumbers(e.target.value)}
                      placeholder="e.g. H01, H02"
                      className={INPUT_CLS}
                    />
                  </label>
                </>
              )}
            </section>
          )}

          {/* ── Section 4: Locations ── */}
          {storeId && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Locations</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL_CLS}>Pickup location <span className="text-red-500">*</span></span>
                  <select
                    required
                    value={pickupLocationId}
                    onChange={(e) => setPickupLocationId(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {locsExtended.map((l) => {
                      const fee = Number(l.deliveryCost ?? l.delivery_cost ?? 0);
                      return (
                        <option key={l.id} value={l.id}>
                          {l.name}{fee > 0 ? ` — ${formatCurrency(fee)}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Return location <span className="text-red-500">*</span></span>
                  <select
                    required
                    value={dropoffLocationId}
                    onChange={(e) => setDropoffLocationId(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {locsExtended.map((l) => {
                      const fee = Number(l.collectionCost ?? l.collection_cost ?? 0);
                      return (
                        <option key={l.id} value={l.id}>
                          {l.name}{fee > 0 ? ` — ${formatCurrency(fee)}` : ''}
                        </option>
                      );
                    })}
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
          {(vehicleModelId && pickupDatetime && dropoffDatetime) && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Price Summary</h3>
              {quoteLoading && !quote ? (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-gray-200" />
                  ))}
                </div>
              ) : quote ? (
                <div className={`rounded-lg border border-gray-200 bg-gray-50 p-4${quoteLoading ? ' opacity-60' : ''}`}>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">
                        Rental ({localRentalDays} {localRentalDays === 1 ? 'day' : 'days'} @ {formatCurrency(quote.dailyRate)}/day)
                      </span>
                      <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.rentalSubtotal)}</span>
                    </div>
                    {pickupFeeLocal > 0 && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Pickup fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(pickupFeeLocal)}</span>
                      </div>
                    )}
                    {dropoffFeeLocal > 0 && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Return fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(dropoffFeeLocal)}</span>
                      </div>
                    )}
                    {filteredAddons.map((addon) => {
                      const qty = selectedAddonIds[String(addon.id)] ?? 0;
                      if (!qty) return null;
                      const unitCost =
                        addon.addonType === 'per_day'
                          ? addon.pricePerDay * (quote.rentalDays ?? localRentalDays)
                          : addon.priceOneTime;
                      return (
                        <div key={addon.id} className="flex justify-between">
                          <span className="font-lato text-sm text-gray-600">
                            {addon.name}{qty > 1 ? ` ×${qty}` : ''}
                          </span>
                          <span className="font-lato text-sm text-gray-800">{formatCurrency(unitCost * qty)}</span>
                        </div>
                      );
                    })}
                    <div className="my-2 border-t border-gray-300" />
                    <div className="flex justify-between">
                      <span className="font-lato text-sm font-semibold text-gray-900">Total</span>
                      <span className="font-lato text-sm font-bold text-gray-900">{formatCurrency(grandTotalLocal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">
                        Security deposit <span className="text-xs text-gray-400">(refundable)</span>
                      </span>
                      <span className="font-lato text-sm text-gray-800">{formatCurrency(quote.securityDeposit)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">
                        Rental ({localRentalDays} {localRentalDays === 1 ? 'day' : 'days'})
                      </span>
                      <span className="font-lato text-sm italic text-gray-400">
                        Calculating...
                      </span>
                    </div>
                    {(pickupFeeLocal > 0) && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Pickup fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(pickupFeeLocal)}</span>
                      </div>
                    )}
                    {(dropoffFeeLocal > 0) && (
                      <div className="flex justify-between">
                        <span className="font-lato text-sm text-gray-600">Dropoff fee</span>
                        <span className="font-lato text-sm text-gray-800">{formatCurrency(dropoffFeeLocal)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Section 7: Payment ── */}
          {(vehicleModelId && pickupDatetime && dropoffDatetime) && (
            <section>
              <h3 className={SECTION_HDR_CLS}>Payment</h3>
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">

                {/* Rental payment method */}
                <div>
                  <label className={LABEL_CLS}>Rental payment method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                {/* Security deposit — mandatory by default; staff can waive */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL_CLS}>Deposit amount <span className="text-red-500">*</span></span>
                    <input
                      type="number"
                      min={0}
                      value={depositAmount === 0 ? '' : depositAmount}
                      onChange={(e) =>
                        setDepositAmount(e.target.value === '' ? 0 : Number(e.target.value))
                      }
                      placeholder="0"
                      disabled={!depositPaid}
                      className={`${INPUT_CLS} disabled:bg-gray-100 disabled:text-gray-400`}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL_CLS}>Deposit method</span>
                    <select
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value)}
                      disabled={!depositPaid}
                      className={`${SELECT_CLS} disabled:bg-gray-100 disabled:text-gray-400`}
                    >
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="waiveDeposit"
                    checked={!depositPaid}
                    onChange={(e) => setDepositPaid(!e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                  />
                  <label htmlFor="waiveDeposit" className="cursor-pointer font-lato text-sm text-gray-600">
                    Waive security deposit
                  </label>
                </div>

                {/* Amount due summary */}
                <div className="space-y-1 border-t border-gray-200 pt-3">
                  <div className="flex justify-between">
                    <span className="font-lato text-sm text-gray-600">Rental total</span>
                    <span className="font-lato text-sm font-semibold text-gray-900">
                      {formatCurrency(grandTotalLocal)}
                    </span>
                  </div>
                  {depositPaid ? (
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-600">Security deposit</span>
                      <span className="font-lato text-sm text-gray-800">
                        {formatCurrency(depositAmount)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="font-lato text-sm text-gray-500 italic">Deposit waived</span>
                      <span className="font-lato text-sm text-gray-400">—</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-lato text-sm font-bold text-gray-900">Total to collect now</span>
                    <span className="font-lato text-sm font-bold text-teal-700">
                      {formatCurrency(grandTotalLocal + (depositPaid ? depositAmount : 0))}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Section 8: Notes ── */}
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

          {createWalkInDirect.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 font-lato text-sm text-red-600">
              {(createWalkInDirect.error as Error).message}
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
              disabled={!isValid || createWalkInDirect.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 font-lato text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createWalkInDirect.isPending ? 'Activating…' : 'Create & Activate'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
