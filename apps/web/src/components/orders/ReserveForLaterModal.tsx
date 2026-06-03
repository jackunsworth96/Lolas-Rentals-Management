import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { normalizeApiBase } from '../../api/normalize-api-base.js';
import { useCreateWalkInReserved } from '../../api/orders-raw.js';
import { useAvailableVehicles } from '../../api/fleet.js';
import { useLocations } from '../../api/config.js';
import { useUIStore } from '../../stores/ui-store.js';
import surfRackIcon from '../../assets/Home/Surf Rack Icon.svg';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AvailableVehicle {
  id: string;
  name: string;
  modelId: string;
  storeId: string;
  status: string;
  surfRack: boolean;
}

interface Location {
  id: number;
  name: string;
  deliveryCost?: number;
  collectionCost?: number;
  delivery_cost?: number;
  collection_cost?: number;
}

interface QuoteBreakdown {
  rentalDays: number;
  dailyRate: number;
  rentalSubtotal: number;
  addonsTotal: number;
  grandTotal: number;
  grandTotalWithFees: number;
  pickupFee: number;
  dropoffFee: number;
}

const TIME_SLOTS = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
];

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function formatCurrency(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const INPUT_CLS =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-lato focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const SELECT_CLS =
  'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-lato focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const SECTION_HDR_CLS =
  'mb-3 font-lato text-xs font-semibold uppercase tracking-widest text-gray-400';
const LABEL_CLS = 'font-lato text-sm font-medium text-gray-700';

export function ReserveForLaterModal({ open, onClose }: Props) {
  const createWalkInReserved = useCreateWalkInReserved();
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';

  // ── Form state ──
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [pickupDate, setPickupDate] = useState(todayDate());
  const [pickupTime, setPickupTime] = useState(nearestTimeSlot());
  const [dropoffDate, setDropoffDate] = useState(todayDate());
  const [dropoffTime, setDropoffTime] = useState(nearestTimeSlot());
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [dropoffLocationId, setDropoffLocationId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedVehicleName, setSelectedVehicleName] = useState('');
  const [vehicleModelId, setVehicleModelId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositMethod, setDepositMethod] = useState('cash');
  const [staffNotes, setStaffNotes] = useState('');

  // ── Quote state ──
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // ── Success state ──
  const [createdRef, setCreatedRef] = useState<string | null>(null);

  // ── Derived datetimes ──
  const pickupDatetime =
    pickupDate && pickupTime ? `${pickupDate}T${pickupTime}:00+08:00` : '';
  const dropoffDatetime =
    dropoffDate && dropoffTime ? `${dropoffDate}T${dropoffTime}:00+08:00` : '';

  const datesValid = !!(
    pickupDatetime && dropoffDatetime && dropoffDatetime > pickupDatetime
  );

  // ── Data hooks ──
  const { data: availableVehicles = [], isLoading: vehiclesLoading } =
    useAvailableVehicles(storeId, pickupDatetime, dropoffDatetime);
  const { data: locations } = useLocations(storeId) as { data: Location[] | undefined };

  // ── Auto-select store location (zero-fee) on open / locations load ──
  useEffect(() => {
    if (!open || !locations || locations.length === 0) return;
    if (pickupLocationId !== '' || dropoffLocationId !== '') return;
    type LocExt = Location & { delivery_cost?: number; collection_cost?: number };
    const locs = locations as LocExt[];
    const storeLoc = locs.find((l) => {
      const dc = Number(l.deliveryCost ?? l.delivery_cost ?? 1);
      const cc = Number(l.collectionCost ?? l.collection_cost ?? 1);
      return dc === 0 && cc === 0;
    });
    const fallback = locs[0];
    const chosen = storeLoc ?? fallback;
    if (chosen) {
      setPickupLocationId(String(chosen.id));
      setDropoffLocationId(String(chosen.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locations, storeId]);

  // ── Quote fetch ──
  useEffect(() => {
    if (!vehicleModelId || !datesValid || !storeId || !pickupLocationId || !dropoffLocationId) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    setQuoteLoading(true);
    const apiBase = normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined);
    const url =
      `${apiBase}/public/booking/quote` +
      `?storeId=${storeId}` +
      `&vehicleModelId=${vehicleModelId}` +
      `&pickupDatetime=${encodeURIComponent(pickupDatetime)}` +
      `&dropoffDatetime=${encodeURIComponent(dropoffDatetime)}` +
      `&pickupLocationId=${pickupLocationId}` +
      `&dropoffLocationId=${dropoffLocationId}`;
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { data?: QuoteBreakdown }) => { if (d.data) setQuote(d.data); })
      .catch((err: unknown) => { if ((err as Error).name !== 'AbortError') setQuote(null); })
      .finally(() => setQuoteLoading(false));
    return () => controller.abort();
  }, [vehicleModelId, pickupDatetime, dropoffDatetime, storeId, pickupLocationId, dropoffLocationId, datesValid]);

  // ── Reset on open ──
  useEffect(() => {
    if (!open) return;
    setCustomerName('');
    setCustomerMobile('');
    setCustomerEmail('');
    setPickupDate(todayDate());
    setPickupTime(nearestTimeSlot());
    setDropoffDate(todayDate());
    setDropoffTime(nearestTimeSlot());
    setPickupLocationId('');
    setDropoffLocationId('');
    setSelectedVehicleId('');
    setSelectedVehicleName('');
    setVehicleModelId('');
    setDiscount(0);
    setDepositAmount(0);
    setDepositMethod('cash');
    setStaffNotes('');
    setQuote(null);
    setCreatedRef(null);
    createWalkInReserved.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleVehicleChange(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    const vehicle = (availableVehicles as AvailableVehicle[]).find((v) => v.id === vehicleId);
    setVehicleModelId(vehicle?.modelId ?? '');
    setSelectedVehicleName(vehicle?.name ?? '');
    setQuote(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehicleId || !datesValid) return;
    const baseTotal = quote?.grandTotalWithFees ?? quote?.grandTotal ?? undefined;
    const discountedTotal = baseTotal != null
      ? Math.max(0, baseTotal - discount)
      : undefined;
    createWalkInReserved.mutate(
      {
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        customerEmail: customerEmail.trim() || undefined,
        storeId,
        vehicleId: selectedVehicleId,
        vehicleModelId,
        vehicleName: selectedVehicleName || undefined,
        pickupDatetime,
        dropoffDatetime,
        pickupLocationId: pickupLocationId ? Number(pickupLocationId) : undefined,
        dropoffLocationId: dropoffLocationId ? Number(dropoffLocationId) : undefined,
        depositAmount,
        depositMethod: depositAmount > 0
          ? (depositMethod as 'cash' | 'gcash' | 'card' | 'bank_transfer')
          : undefined,
        grandTotal: discountedTotal,
        rentalDays: quote?.rentalDays ?? undefined,
        dailyRate: quote?.dailyRate ?? undefined,
        discount: discount > 0 ? discount : undefined,
        staffNotes: staffNotes.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setCreatedRef(data.order_reference ?? null);
          setTimeout(() => onClose(), 2500);
        },
      },
    );
  }

  const isSubmitting = createWalkInReserved.isPending;
  const error = createWalkInReserved.error;

  // ── Computed local fee helpers ──
  type LocExt = Location & { delivery_cost?: number; collection_cost?: number };
  const locsExt = (locations ?? []) as LocExt[];
  const pickupLoc = locsExt.find((l) => String(l.id) === pickupLocationId);
  const dropoffLoc = locsExt.find((l) => String(l.id) === dropoffLocationId);
  const pickupFeeLocal = Number(pickupLoc?.deliveryCost ?? pickupLoc?.delivery_cost ?? 0);
  const dropoffFeeLocal = Number(dropoffLoc?.collectionCost ?? dropoffLoc?.collection_cost ?? 0);

  // ── Success screen ──
  if (createdRef) {
    return (
      <Modal open={open} onClose={onClose} title="Reserve for Later" size="lg">
        <div className="space-y-5">
          <div className="rounded-xl bg-amber-50 px-5 py-4 text-center">
            <p className="font-lato text-sm font-semibold uppercase tracking-widest text-amber-600">
              Reserved — Pending Activation
            </p>
            <p className="mt-2 font-lato text-3xl font-black tracking-wide text-gray-900">
              {createdRef}
            </p>
            <p className="mt-1 font-lato text-sm text-gray-500">
              Walk-in reservation for{' '}
              <span className="font-medium text-gray-700">{customerName}</span>{' '}
              is in the inbox. The vehicle is held until you activate the booking.
            </p>
          </div>

          {(depositAmount > 0 || quote) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              {quote && (
                <>
                  {discount > 0 && (
                    <p className="font-lato text-sm text-green-700">
                      <span className="font-semibold">Discount applied:</span>{' '}
                      {formatCurrency(discount)}
                    </p>
                  )}
                  <p className="font-lato text-sm text-amber-800">
                    <span className="font-semibold">Estimated total:</span>{' '}
                    {formatCurrency(Math.max(0, (quote.grandTotalWithFees ?? quote.grandTotal) - discount))}
                  </p>
                </>
              )}
              {depositAmount > 0 && (
                <p className="font-lato text-sm text-amber-800">
                  <span className="font-semibold">Deposit collected:</span>{' '}
                  {formatCurrency(depositAmount)} via{' '}
                  {depositMethod === 'bank_transfer' ? 'Bank Transfer' : depositMethod.charAt(0).toUpperCase() + depositMethod.slice(1)}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-teal-600 px-5 py-2 font-lato text-sm font-semibold text-white transition-colors hover:bg-teal-700"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Form ──
  return (
    <Modal open={open} onClose={onClose} title="Reserve for Later" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Customer */}
        <div>
          <p className={SECTION_HDR_CLS}>Customer</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={LABEL_CLS}>
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="e.g. Juan dela Cruz"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLS}>
                Mobile <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                className={INPUT_CLS}
                placeholder="+63 9XX XXX XXXX"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Email (optional)</label>
              <input
                type="email"
                className={INPUT_CLS}
                placeholder="customer@email.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Dates */}
        <div>
          <p className={SECTION_HDR_CLS}>Rental Period</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>
                Pickup date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={INPUT_CLS}
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLS}>
                Pickup time <span className="text-red-500">*</span>
              </label>
              <select
                className={SELECT_CLS}
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                required
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>
                Dropoff date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={INPUT_CLS}
                value={dropoffDate}
                onChange={(e) => setDropoffDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLS}>
                Dropoff time <span className="text-red-500">*</span>
              </label>
              <select
                className={SELECT_CLS}
                value={dropoffTime}
                onChange={(e) => setDropoffTime(e.target.value)}
                required
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          {!datesValid && pickupDatetime && dropoffDatetime && (
            <p className="mt-1 font-lato text-xs text-red-600">
              Drop-off must be after pick-up.
            </p>
          )}
        </div>

        {/* Locations */}
        {locations && locations.length > 0 && (
          <div>
            <p className={SECTION_HDR_CLS}>Pickup / Dropoff</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Pickup location</label>
                <select
                  className={SELECT_CLS}
                  value={pickupLocationId}
                  onChange={(e) => setPickupLocationId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Dropoff location</label>
                <select
                  className={SELECT_CLS}
                  value={dropoffLocationId}
                  onChange={(e) => setDropoffLocationId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {(pickupFeeLocal > 0 || dropoffFeeLocal > 0) && (
              <p className="mt-1 font-lato text-xs text-gray-500">
                Transfer fees:{' '}
                {pickupFeeLocal > 0 && `Pickup ${formatCurrency(pickupFeeLocal)}`}
                {pickupFeeLocal > 0 && dropoffFeeLocal > 0 && ' · '}
                {dropoffFeeLocal > 0 && `Dropoff ${formatCurrency(dropoffFeeLocal)}`}
              </p>
            )}
          </div>
        )}

        {/* Vehicle */}
        <div>
          <p className={SECTION_HDR_CLS}>Vehicle</p>
          <label className={LABEL_CLS}>
            Assign specific unit <span className="text-red-500">*</span>
          </label>
          {!datesValid ? (
            <p className="mt-2 font-lato text-xs text-gray-400 italic">
              Set valid pickup and drop-off times first to see available vehicles.
            </p>
          ) : vehiclesLoading ? (
            <p className="mt-2 font-lato text-xs text-gray-400">Loading available vehicles…</p>
          ) : (availableVehicles as AvailableVehicle[]).length === 0 ? (
            <p className="mt-2 font-lato text-xs text-red-500">
              No vehicles available for the selected dates.
            </p>
          ) : (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-300 divide-y divide-gray-100">
              {(availableVehicles as AvailableVehicle[]).map((v) => (
                <label
                  key={v.id}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50 ${selectedVehicleId === v.id ? 'bg-teal-50' : ''}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="reserve-later-vehicle"
                    value={v.id}
                    checked={selectedVehicleId === v.id}
                    onChange={() => handleVehicleChange(v.id)}
                  />
                  <span className={`flex-1 font-lato text-sm ${selectedVehicleId === v.id ? 'font-semibold text-teal-800' : 'text-gray-800'}`}>
                    {v.name}
                  </span>
                  {v.surfRack && (
                    <img src={surfRackIcon} className="h-5 w-5 shrink-0" alt="Surf rack" title="Has surf rack" />
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Quote */}
        {selectedVehicleId && datesValid && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <p className={SECTION_HDR_CLS}>Estimated Total</p>
            {quoteLoading ? (
              <p className="font-lato text-sm text-gray-400">Calculating…</p>
            ) : quote ? (
              <>
                <div className="space-y-1 font-lato text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>{quote.rentalDays} day{quote.rentalDays !== 1 ? 's' : ''} × {formatCurrency(quote.dailyRate)}/day</span>
                    <span>{formatCurrency(quote.rentalSubtotal)}</span>
                  </div>
                  {quote.pickupFee > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Pickup transfer</span>
                      <span>{formatCurrency(quote.pickupFee)}</span>
                    </div>
                  )}
                  {quote.dropoffFee > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Dropoff transfer</span>
                      <span>{formatCurrency(quote.dropoffFee)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Discount</span>
                      <span>−{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
                    <span>Estimated total</span>
                    <span>
                      {discount > 0 ? (
                        <>
                          <span className="mr-2 font-normal text-gray-400 line-through">
                            {formatCurrency(quote.grandTotalWithFees ?? quote.grandTotal)}
                          </span>
                          {formatCurrency(Math.max(0, (quote.grandTotalWithFees ?? quote.grandTotal) - discount))}
                        </>
                      ) : (
                        formatCurrency(quote.grandTotalWithFees ?? quote.grandTotal)
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Stored with the reservation · confirmed at activation
                  </p>
                </div>

                {/* Discount input */}
                <div className="border-t border-gray-200 pt-3">
                  <label className={LABEL_CLS}>Discount (₱)</label>
                  <input
                    type="number"
                    className={INPUT_CLS}
                    min={0}
                    step={1}
                    value={discount === 0 ? '' : discount}
                    placeholder="0"
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  />
                  {discount > 0 && (
                    <p className="mt-1 font-lato text-xs text-green-600">
                      {formatCurrency(discount)} discount applied to the estimated total.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="font-lato text-xs text-gray-400 italic">
                Select pickup &amp; dropoff locations to see an estimate.
              </p>
            )}
          </div>
        )}

        {/* Deposit */}
        <div>
          <p className={SECTION_HDR_CLS}>Deposit</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Deposit amount (₱)</label>
              <input
                type="number"
                className={INPUT_CLS}
                min={0}
                step={1}
                value={depositAmount === 0 ? '' : depositAmount}
                placeholder="0"
                onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Deposit method</label>
              <select
                className={SELECT_CLS}
                value={depositMethod}
                onChange={(e) => setDepositMethod(e.target.value)}
                disabled={depositAmount === 0}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          {depositAmount === 0 && (
            <p className="mt-1 font-lato text-xs text-gray-400 italic">
              No deposit — enter an amount above to record one.
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={LABEL_CLS}>Staff notes</label>
          <textarea
            className={`${INPUT_CLS} h-20 resize-none`}
            placeholder="Any additional notes for the team…"
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
          />
        </div>

        {/* Info callout */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-lato text-xs text-amber-700">
            This reservation stays in the <strong>inbox</strong> until activated. The vehicle
            will be marked as unavailable for the selected dates immediately.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="font-lato text-sm text-red-600">
            {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-lato text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !customerName.trim() || !customerMobile.trim() || !selectedVehicleId || !datesValid}
            className="rounded-lg bg-teal-600 px-5 py-2 font-lato text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Reserving…' : 'Reserve for Later'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
