import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { api } from '../../api/client.js';
import { useAddons, useLocations } from '../../api/config.js';
import { useOrderAddons, useOrderItems } from '../../api/orders.js';
import type { EnrichedOrder } from '../../types/api.js';
import { formatCurrency } from '../../utils/currency.js';

interface Props {
  open: boolean;
  onClose: () => void;
  enrichedData: EnrichedOrder;
}

interface PreviewData {
  extensionDays: number;
  dailyRate: number;
  extensionTotal: number;
  bracketLabel: string;
}

type Step = 'dates' | 'review' | 'success';

type ConfigAddon = {
  id: number;
  name: string;
  pricePerDay?: number;
  price_per_day?: number;
  priceOneTime?: number;
  price_one_time?: number;
  addonType?: string;
  addon_type?: string;
  isActive?: boolean;
  is_active?: boolean;
};

type ConfigLocation = {
  id: number;
  name: string;
  deliveryCost?: number;
  delivery_cost?: number;
  collectionCost?: number;
  collection_cost?: number;
  locationType?: string | null;
  location_type?: string | null;
  isActive?: boolean;
  is_active?: boolean;
};

type OrderAddonRow = {
  id: string;
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
};

const TIME_SLOTS = [
  '09:15', '09:45', '10:15', '10:45',
  '11:15', '11:45', '12:15', '12:45',
  '13:15', '13:45', '14:15', '14:45',
  '15:15', '15:45', '16:15', '16:45',
  '17:15',
];

function formatSlotLabel(slot: string): string {
  const [hStr, mStr] = slot.split(':');
  const h = Number(hStr);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function formatReturnDatetime(dt: string): string {
  return new Date(dt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function minDate(currentDropoff: string): string {
  if (!currentDropoff) return new Date().toISOString().slice(0, 10);
  return currentDropoff.slice(0, 10);
}

function defaultNewDate(currentDropoff: string): string {
  const d = currentDropoff ? new Date(currentDropoff) : new Date();
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    return fallback.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gcash', label: 'GCash' },
  { id: 'card', label: 'Card' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
];

function getAccountId(method: string, storeId: string): string {
  const isBass = storeId === 'store-bass';
  switch (method) {
    case 'cash': return isBass ? 'CASH-BASS' : 'CASH-LOLA';
    case 'gcash': return 'GCASH-store-lolas';
    case 'card': return 'CARD-TERMINAL-store-lolas';
    case 'bank_transfer': return 'BANK-UNION-BANK-store-lolas';
    default: return '';
  }
}

function isStoreLocation(loc: ConfigLocation): boolean {
  const collection = Number(loc.collectionCost ?? loc.collection_cost ?? 0);
  const delivery = Number(loc.deliveryCost ?? loc.delivery_cost ?? 0);
  const type = loc.locationType ?? loc.location_type ?? null;
  return collection === 0 && delivery === 0 && (type === 'store' || type === null);
}

export function ExtendOrderModal({ open, onClose, enrichedData }: Props) {
  const qc = useQueryClient();
  const storeId = enrichedData.storeId;
  const orderId = enrichedData.id;

  const currentDropoff = enrichedData.returnDatetime ?? '';

  // Step state
  const [step, setStep] = useState<Step>('dates');
  const [newDate, setNewDate] = useState(() => defaultNewDate(currentDropoff));
  const [newTime, setNewTime] = useState('');
  const [overrideEmail, setOverrideEmail] = useState('');

  // Add-on state
  const [selectedOneTimeAddonIds, setSelectedOneTimeAddonIds] = useState<number[]>([]);
  const [selectedPerDayAddonIds, setSelectedPerDayAddonIds] = useState<number[]>([]);

  // Location state
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState('');

  // Review / payment state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [overrideRate, setOverrideRate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ datetime: string; extensionCost: number } | null>(null);

  const emailToUse = enrichedData.customerEmail?.trim() || overrideEmail.trim();
  const orderReference = enrichedData.bookingToken ?? enrichedData.wooOrderId;

  // Fetch catalog data
  const { data: configAddonsRaw = [] } = useAddons(storeId) as { data: ConfigAddon[] };
  const { data: configLocationsRaw = [] } = useLocations(storeId) as { data: ConfigLocation[] };
  const { data: orderAddonsRaw = [] } = useOrderAddons(orderId) as { data: OrderAddonRow[] };
  const { data: orderItemsRaw = [] } = useOrderItems(orderId) as { data: Array<{ rentalDaysCount?: number }> };

  const configAddons = useMemo(
    () => configAddonsRaw.filter((a) => a.isActive !== false && a.is_active !== false),
    [configAddonsRaw],
  );

  const configLocations = useMemo(
    () => configLocationsRaw.filter((l) => l.isActive !== false && l.is_active !== false),
    [configLocationsRaw],
  );

  const existingAddonNames = useMemo(
    () => new Set(orderAddonsRaw.map((a) => a.addonName.toLowerCase())),
    [orderAddonsRaw],
  );

  // Extension days (estimated from date+time)
  const newDropoffDatetime = newDate && newTime ? `${newDate}T${newTime}:00+08:00` : '';
  const extensionDays = useMemo(() => {
    if (!newDropoffDatetime || !currentDropoff) return 0;
    const ms = new Date(newDropoffDatetime).getTime() - new Date(currentDropoff).getTime();
    return Math.max(1, Math.ceil(ms / 86400000));
  }, [newDropoffDatetime, currentDropoff]);

  // Original rental days — used to derive per-day rate from total_amount
  const originalRentalDays = useMemo(
    () => Math.max(1, orderItemsRaw[0]?.rentalDaysCount ?? 1),
    [orderItemsRaw],
  );

  // Per-day addon delta from existing addons.
  // Use total_amount / originalRentalDays to get the actual per-day rate, avoiding issues
  // where some booking paths store quantity = rentalDays rather than unit count.
  const perDayAddonDelta = useMemo(
    () => orderAddonsRaw
      .filter((a) => a.addonType === 'per_day')
      .reduce((sum, a) => {
        const perDayRate = a.totalAmount / originalRentalDays;
        return sum + Math.round(perDayRate * extensionDays * 100) / 100;
      }, 0),
    [orderAddonsRaw, extensionDays, originalRentalDays],
  );

  // Current dropoff fee — find from config locations (the one that matches what the order was at)
  // We don't have the exact ID easily from enrichedData, so we'll track selected vs store default
  const currentDropoffFee = useMemo(() => {
    // No easy way to know original fee from enrichedData alone, default to 0
    return 0;
  }, []);

  const selectedLoc = selectedLocationId != null
    ? configLocations.find((l) => l.id === selectedLocationId)
    : null;
  const locationDelta = selectedLoc
    ? Math.round((Number(selectedLoc.collectionCost ?? selectedLoc.collection_cost ?? 0) - currentDropoffFee) * 100) / 100
    : 0;

  // New one-time add-on cost
  const newOneTimeCost = useMemo(() => {
    return configAddons
      .filter((ca) => selectedOneTimeAddonIds.includes(ca.id))
      .reduce((sum, ca) => sum + Number(ca.priceOneTime ?? ca.price_one_time ?? 0), 0);
  }, [configAddons, selectedOneTimeAddonIds]);

  // New per-day add-on cost (for extension days)
  const newPerDayCost = useMemo(() => {
    return configAddons
      .filter((ca) => selectedPerDayAddonIds.includes(ca.id))
      .reduce((sum, ca) => sum + Math.round(Number(ca.pricePerDay ?? ca.price_per_day ?? 0) * extensionDays * 100) / 100, 0);
  }, [configAddons, selectedPerDayAddonIds, extensionDays]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('dates');
      setNewDate(defaultNewDate(currentDropoff));
      setNewTime('');
      setOverrideEmail('');
      setSelectedOneTimeAddonIds([]);
      setSelectedPerDayAddonIds([]);
      setSelectedLocationId(null);
      setLocationAddress('');
      setPreviewData(null);
      setOverrideRate('');
      setPaymentStatus('unpaid');
      setPaymentMethod('');
      setLoading(false);
      setError(null);
      setSuccessResult(null);
    }
  }, [open, currentDropoff]);

  // Auto-close after success
  useEffect(() => {
    if (!successResult) return;
    const t = setTimeout(() => onClose(), 2500);
    return () => clearTimeout(t);
  }, [successResult, onClose]);

  function toggleOneTimeAddon(id: number) {
    setSelectedOneTimeAddonIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function togglePerDayAddon(id: number) {
    setSelectedPerDayAddonIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleCalculate() {
    if (!newDropoffDatetime || !emailToUse || !orderReference) return;

    if (currentDropoff && new Date(newDropoffDatetime) <= new Date(currentDropoff)) {
      setError('New return date/time must be after the current return date.');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ orderReference, email: emailToUse, newDropoffDatetime });

    try {
      const data = await api.get<PreviewData>(`/public/extend/preview?${params}`);
      setPreviewData(data);
      setOverrideRate(String(data.dailyRate));
      setStep('review');
    } catch (err) {
      setError((err as Error).message ?? 'Could not calculate extension. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!previewData || !newDropoffDatetime || !emailToUse || !orderReference) return;
    if (paymentStatus === 'paid' && !paymentMethod) return;

    const rateNum = parseFloat(overrideRate);
    const effectiveRate = !isNaN(rateNum) && rateNum > 0 ? rateNum : previewData.dailyRate;
    const isOverride = Math.abs(effectiveRate - previewData.dailyRate) > 0.001;
    const accountId = paymentStatus === 'paid' && paymentMethod
      ? getAccountId(paymentMethod, storeId)
      : undefined;

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{ success: boolean; newDropoffDatetime?: string; extensionCost?: number; reason?: string }>(
        '/extend/confirm',
        {
          orderReference,
          email: emailToUse,
          newDropoffDatetime,
          ...(isOverride ? { overrideDailyRate: effectiveRate } : {}),
          paymentStatus,
          ...(paymentStatus === 'paid' && paymentMethod
            ? { paymentMethod, paymentAccountId: accountId }
            : {}),
          ...(selectedOneTimeAddonIds.length > 0 ? { newOneTimeAddonIds: selectedOneTimeAddonIds } : {}),
          ...(selectedPerDayAddonIds.length > 0 ? { newPerDayAddonIds: selectedPerDayAddonIds } : {}),
          ...(selectedLocationId != null ? { newDropoffLocationId: selectedLocationId } : {}),
          ...(locationAddress.trim() ? { newDropoffLocationAddress: locationAddress.trim() } : {}),
        },
      );

      if (res.success) {
        const orderId = enrichedData.id;
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['orders'] }),
          qc.invalidateQueries({ queryKey: ['orders', 'enriched'] }),
          ...(orderId
            ? [
                qc.invalidateQueries({ queryKey: ['orders', orderId] }),
                qc.invalidateQueries({ queryKey: ['orders', orderId, 'items'] }),
                qc.invalidateQueries({ queryKey: ['orders', orderId, 'payments'] }),
                qc.invalidateQueries({ queryKey: ['orders', orderId, 'addons'] }),
                qc.invalidateQueries({ queryKey: ['orders', orderId, 'swaps'] }),
                qc.invalidateQueries({ queryKey: ['orders', orderId, 'history'] }),
              ]
            : []),
        ]);
        setSuccessResult({
          datetime: res.newDropoffDatetime ?? newDropoffDatetime,
          extensionCost: res.extensionCost ?? Math.round(effectiveRate * previewData.extensionDays * 100) / 100,
        });
        setStep('success');
      } else {
        setError(res.reason ?? 'Extension failed. Please try again.');
      }
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Derived values for review step
  const rateNum = parseFloat(overrideRate);
  const effectiveRate = !isNaN(rateNum) && rateNum > 0 ? rateNum : (previewData?.dailyRate ?? 0);
  const rentalExtensionTotal = previewData ? Math.round(effectiveRate * previewData.extensionDays * 100) / 100 : 0;
  const computedTotal = rentalExtensionTotal + perDayAddonDelta + newOneTimeCost + newPerDayCost + locationDelta;

  const step1Valid = !!(newDate && newTime && emailToUse && orderReference);
  const step2Valid = paymentStatus === 'unpaid' || !!paymentMethod;

  const STEP_LABELS: Record<Step, string> = {
    dates: 'Extend Booking',
    review: 'Review & Payment',
    success: 'Extend Booking',
  };

  return (
    <Modal open={open} onClose={onClose} title={STEP_LABELS[step]} size="sm">

      {/* ── SUCCESS ── */}
      {step === 'success' && successResult && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900">Booking Extended!</p>
            <p className="text-sm text-gray-500">New return date</p>
            <p className="text-sm font-semibold text-teal-700">{formatReturnDatetime(successResult.datetime)}</p>
          </div>
          {successResult.extensionCost > 0 && (
            <div className="rounded-lg bg-gray-50 py-2 text-center">
              <span className="text-xs text-gray-500">Extension fee: </span>
              <span className={`text-sm font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                {formatCurrency(successResult.extensionCost)}{' '}
                {paymentStatus === 'paid' ? '— Paid' : '— Pending'}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400">Closing…</p>
        </div>
      )}

      {/* ── STEP 1: DATES + ADD-ONS + LOCATION ── */}
      {step === 'dates' && (
        <div className="space-y-5">
          {/* Read-only summary */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium text-gray-900">{enrichedData.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vehicle</span>
              <span className="font-medium text-gray-900">{enrichedData.vehicleNames || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Current return</span>
              <span className="font-medium text-gray-900">
                {currentDropoff ? formatReturnDatetime(currentDropoff) : '—'}
              </span>
            </div>
          </div>

          {/* Email override */}
          {!enrichedData.customerEmail?.trim() && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Customer email <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-gray-400">(not on record — required)</span>
              </span>
              <input
                type="email"
                required
                value={overrideEmail}
                onChange={(e) => setOverrideEmail(e.target.value)}
                placeholder="customer@example.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
          )}

          {!orderReference && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No order reference on this booking — extension may not be available via this flow.
            </p>
          )}

          {/* New return date & time */}
          <div>
            <span className="text-sm font-medium text-gray-700">New return date &amp; time <span className="text-red-500">*</span></span>
            <div className="mt-1 flex gap-2">
              <input
                type="date"
                required
                value={newDate}
                min={minDate(currentDropoff)}
                onChange={(e) => { setNewDate(e.target.value); setError(null); }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <select
                required
                value={newTime}
                onChange={(e) => { setNewTime(e.target.value); setError(null); }}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select time</option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{formatSlotLabel(slot)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Existing order add-ons (read-only display) ── */}
          {orderAddonsRaw.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Current Add-ons</p>
              <div className="space-y-1.5">
                {orderAddonsRaw.map((a) => {
                  const isPerDay = a.addonType === 'per_day';
                  const perDayRate = isPerDay ? a.totalAmount / originalRentalDays : 0;
                  const extraCost = isPerDay && extensionDays > 0
                    ? Math.round(perDayRate * extensionDays * 100) / 100
                    : 0;
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-green-800">{a.addonName}</span>
                        {isPerDay && newTime && extensionDays > 0 && (
                          <span className="ml-2 text-xs text-green-700">+{formatCurrency(extraCost)} ({extensionDays} days)</span>
                        )}
                      </div>
                      <span className="text-xs text-green-600">{isPerDay ? 'Per day' : 'One-time'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Add-on picker (staff sees all types) ── */}
          {configAddons.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Add to extension</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {configAddons
                  .filter((ca) => !existingAddonNames.has(ca.name.toLowerCase()))
                  .map((ca) => {
                    const type = (ca.addonType ?? ca.addon_type ?? 'one_time') as string;
                    const isPerDay = type === 'per_day';
                    const price = isPerDay
                      ? Number(ca.pricePerDay ?? ca.price_per_day ?? 0)
                      : Number(ca.priceOneTime ?? ca.price_one_time ?? 0);
                    const isSelected = isPerDay
                      ? selectedPerDayAddonIds.includes(ca.id)
                      : selectedOneTimeAddonIds.includes(ca.id);
                    const displayCost = isPerDay && extensionDays > 0
                      ? Math.round(price * extensionDays * 100) / 100
                      : price;

                    return (
                      <button
                        key={ca.id}
                        type="button"
                        onClick={() => isPerDay ? togglePerDayAddon(ca.id) : toggleOneTimeAddon(ca.id)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          isSelected
                            ? 'border-teal-300 bg-teal-50 text-teal-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <div className="font-medium">{ca.name}</div>
                          <div className="text-gray-400">
                            {isPerDay
                              ? `${formatCurrency(price)}/day × ${extensionDays || '?'} days`
                              : `${formatCurrency(price)} one-time`}
                          </div>
                        </div>
                        <div className="ml-2 shrink-0 text-right">
                          <div className="font-semibold">{formatCurrency(displayCost)}</div>
                          {isSelected && <div className="text-teal-600">Added</div>}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Location picker ── */}
          {configLocations.length > 1 && (
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Change return location</p>
              <select
                value={selectedLocationId ?? ''}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value ? Number(e.target.value) : null);
                  setLocationAddress('');
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">— Keep current location —</option>
                {configLocations.map((loc) => {
                  const cost = Number(loc.collectionCost ?? loc.collection_cost ?? 0);
                  const free = isStoreLocation(loc);
                  return (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}{free ? ' (Store — Free)' : ` — ${formatCurrency(cost)} fee`}
                    </option>
                  );
                })}
              </select>
              {selectedLocationId != null && selectedLoc && !isStoreLocation(selectedLoc) && (
                <input
                  type="text"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="Exact address / landmark"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              )}
              {selectedLocationId != null && locationDelta !== 0 && (
                <p className={`mt-1 text-xs font-medium ${locationDelta > 0 ? 'text-amber-700' : 'text-teal-700'}`}>
                  {locationDelta > 0
                    ? `+${formatCurrency(locationDelta)} location fee`
                    : `${formatCurrency(Math.abs(locationDelta))} credit (location refund)`}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={loading || !step1Valid}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Calculating…' : 'Calculate Extension →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: REVIEW & PAYMENT ── */}
      {step === 'review' && previewData && (
        <div className="space-y-5">
          {/* Extension summary */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-600">Extension</span>
              <span className="font-medium text-gray-900">{previewData.extensionDays} day{previewData.extensionDays !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-600">Pricing bracket</span>
              <span className="text-gray-700">{previewData.bracketLabel}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <label className="text-gray-600">Rate per day</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">₱</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-600">Rental extension</span>
              <span className="font-medium text-gray-900">{formatCurrency(rentalExtensionTotal)}</span>
            </div>

            {/* Per-day addon adjustments */}
            {perDayAddonDelta > 0 && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-600">Per-day add-on adjustment</span>
                <span className="font-medium text-gray-900">+{formatCurrency(perDayAddonDelta)}</span>
              </div>
            )}

            {/* New one-time add-ons */}
            {selectedOneTimeAddonIds.length > 0 && configAddons
              .filter((ca) => selectedOneTimeAddonIds.includes(ca.id))
              .map((ca) => (
                <div key={ca.id} className="flex justify-between px-4 py-2.5">
                  <span className="text-gray-600">{ca.name}</span>
                  <span className="font-medium text-gray-900">+{formatCurrency(Number(ca.priceOneTime ?? ca.price_one_time ?? 0))}</span>
                </div>
              ))}

            {/* New per-day add-ons */}
            {selectedPerDayAddonIds.length > 0 && configAddons
              .filter((ca) => selectedPerDayAddonIds.includes(ca.id))
              .map((ca) => {
                const price = Number(ca.pricePerDay ?? ca.price_per_day ?? 0);
                const total = Math.round(price * previewData.extensionDays * 100) / 100;
                return (
                  <div key={ca.id} className="flex justify-between px-4 py-2.5">
                    <span className="text-gray-600">{ca.name} ({previewData.extensionDays}d)</span>
                    <span className="font-medium text-gray-900">+{formatCurrency(total)}</span>
                  </div>
                );
              })}

            {/* Location delta */}
            {locationDelta !== 0 && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-600">Location change</span>
                <span className={`font-medium ${locationDelta > 0 ? 'text-gray-900' : 'text-teal-700'}`}>
                  {locationDelta > 0 ? `+${formatCurrency(locationDelta)}` : `−${formatCurrency(Math.abs(locationDelta))}`}
                </span>
              </div>
            )}

            <div className="flex justify-between px-4 py-2.5">
              <span className="font-medium text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(computedTotal)}</span>
            </div>
          </div>

          {/* Payment toggle */}
          <div>
            <span className="text-sm font-medium text-gray-700">Payment</span>
            <div className="mt-1.5 flex gap-2">
              {(['unpaid', 'paid'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setPaymentStatus(s); setPaymentMethod(''); }}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    paymentStatus === s
                      ? s === 'paid'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {s === 'unpaid' ? 'Mark as unpaid' : 'Paid now'}
                </button>
              ))}
            </div>
          </div>

          {paymentStatus === 'paid' && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Payment method <span className="text-red-500">*</span></span>
              <select
                required
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select method…</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between border-t border-gray-200 pt-4">
            <button type="button" onClick={() => { setStep('dates'); setError(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              ← Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !step2Valid}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Confirming…' : 'Confirm Extension'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
