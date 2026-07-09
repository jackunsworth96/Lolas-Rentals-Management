import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  getPartnerRef,
  clearPartnerRef,
  getStoredPartnerBenefit,
} from '../../utils/partnerRef.js';
import { computePartnerBenefit } from '../../utils/partnerDiscount.js';
import { useBookingStore, type BasketItem, type RenterDetails } from '../../stores/bookingStore.js';
import { useToast } from '../../hooks/useToast.js';
import { BasketVehicleGroupCard } from '../../components/basket/BasketVehicleGroupCard.js';
import { AddOnsSection, isNinePmReturnAddonName } from '../../components/basket/AddOnsSection.js';
import { TransferSection } from '../../components/basket/TransferSection.js';
import { RenterDetailsForm } from '../../components/basket/RenterDetailsForm.js';
import { OrderSummaryPanel } from '../../components/basket/OrderSummaryPanel.js';
import { OrderReviewSheet } from '../../components/basket/OrderReviewSheet.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import type { Addon, TransferDetails, RenterInfo, PaymentMethodOption } from '../../components/basket/basket-types.js';

import pawPrint from '../../assets/Paw Print.svg';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';

interface QuoteResponse {
  dailyRate: number;
  securityDeposit: number;
  grandTotal: number;
}

interface AvailableModel {
  modelId: string;
  availableCount: number;
}

interface HydratedBookingSession {
  sessionToken: string;
  storeId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId: number | null;
  dropoffLocationId: number | null;
  basket: BasketItem[];
  renterDetails: Partial<RenterDetails> | null;
  addonIds: number[];
  selectedAddons?: Array<{
    id: number;
    name: string;
    type: 'per_day' | 'one_time';
    unitPrice: number;
    total: number;
  }>;
  quote?: {
    rentalSubtotal: number;
    pickupFee: number;
    dropoffFee: number;
    addonsTotal: number;
    grandTotal: number;
    securityDeposit: number;
  } | null;
  transfer: Partial<TransferDetails> | null;
}

const TIME_SLOTS: { value: string; label: string }[] = [
  '09:15','09:45','10:15','10:45',
  '11:15','11:45','12:15','12:45',
  '13:15','13:45','14:15','14:45',
  '15:15','15:45','16:15','16:45',
].map((t) => {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr;
  const h12 = h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return { value: t, label: `${h12}:${m} ${ampm}` };
});

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * datetime-local inputs produce a naive "YYYY-MM-DDTHH:mm" string with no
 * timezone. Flight arrival times are always in Philippine time (UTC+8), so we
 * pin the offset before the value is sent to the API. This mirrors the same
 * fix applied to pickupDatetime / dropoffDatetime.
 */
function toManilaDatetime(naive: string): string {
  if (!naive) return naive;
  if (naive.includes('+') || naive.endsWith('Z')) return naive;
  // datetime-local gives HH:mm (16 chars); add :00 seconds + offset
  return naive.length === 16 ? `${naive}:00+08:00` : `${naive}+08:00`;
}

function rentalDaysFromDates(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 1;
  const ms = new Date(dropoff).getTime() - new Date(pickup).getTime();
  const hours = ms / (1000 * 60 * 60);
  const days = hours / 24;
  return Math.max(1, Math.ceil(days));
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function addonLineTotal(addon: Addon, rentalDaysCount: number): number {
  if (addon.addonType === 'per_day') return addon.pricePerDay * rentalDaysCount;
  return addon.priceOneTime;
}

export default function BasketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handoffSessionToken = searchParams.get('sessionToken')?.trim() ?? '';

  const basket = useBookingStore((s) => s.basket);
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const clearBasket = useBookingStore((s) => s.clearBasket);
  const resetBookingSession = useBookingStore((s) => s.resetBookingSession);
  const updateBasketRate = useBookingStore((s) => s.updateBasketRate);
  const replaceBasketHold = useBookingStore((s) => s.replaceBasketHold);
  const setDates = useBookingStore((s) => s.setDates);
  const setLocations = useBookingStore((s) => s.setLocations);
  const storedRenterDetails = useBookingStore((s) => s.renterDetails);
  const setRenterDetailsInStore = useBookingStore((s) => s.setRenterDetails);
  const clearRenterDetails = useBookingStore((s) => s.clearRenterDetails);
  const hydrateBookingSession = useBookingStore((s) => s.hydrateBookingSession);

  const rentalDays = rentalDaysFromDates(pickupDatetime, dropoffDatetime);

  const [priceChanged, setPriceChanged] = useState(false);
  const lastQuotedDatesRef = useRef({ pickup: '', dropoff: '' });

  // ── Change Dates & Locations ──
  const [changingDates, setChangingDates] = useState(false);
  const [newPickupDate, setNewPickupDate] = useState('');
  const [newPickupTime, setNewPickupTime] = useState('09:15');
  const [newDropoffDate, setNewDropoffDate] = useState('');
  const [newDropoffTime, setNewDropoffTime] = useState('09:15');
  const [newPickupLocationId, setNewPickupLocationId] = useState<number | null>(null);
  const [newDropoffLocationId, setNewDropoffLocationId] = useState<number | null>(null);
  const [newPickupLocationAddress, setNewPickupLocationAddress] = useState('');
  const [newDropoffLocationAddress, setNewDropoffLocationAddress] = useState('');
  const [dateChangeError, setDateChangeError] = useState('');
  const [dateChangeLoading, setDateChangeLoading] = useState(false);

  // Address inputs for non-store locations (set from basket page main view)
  const [pickupLocationAddress, setPickupLocationAddress] = useState('');
  const [dropoffLocationAddress, setDropoffLocationAddress] = useState('');
  const [hydratingSession, setHydratingSession] = useState(Boolean(handoffSessionToken));
  const [hydrationError, setHydrationError] = useState('');

  async function swapHold(
    item: BasketItem,
    pickup: string,
    dropoff: string,
  ): Promise<boolean> {
    // 1. Check availability before touching the existing hold
    let avail: AvailableModel[];
    try {
      avail = await api.get<AvailableModel[]>(
        `/public/booking/availability?storeId=${encodeURIComponent(storeId)}&pickupDatetime=${encodeURIComponent(pickup)}&dropoffDatetime=${encodeURIComponent(dropoff)}`,
      );
    } catch {
      return false;
    }
    const match = avail.find((m) => m.modelId === item.vehicleModelId && m.availableCount > 0);
    if (!match) return false;

    // 2. Create the new hold first
    let newHold: { holdId: string; expiresAt: string };
    try {
      newHold = await api.post<{ holdId: string; expiresAt: string }>('/public/booking/hold', {
        vehicleModelId: item.vehicleModelId,
        storeId,
        pickupDatetime: pickup,
        dropoffDatetime: dropoff,
        sessionToken,
      });
    } catch {
      return false; // New hold failed — existing hold untouched
    }

    // 3. Release the old hold (fire-and-forget — expiry handles cleanup if this fails)
    api.delete(`/public/booking/hold/${item.holdId}`, { sessionToken }).catch(() => {});

    // 4. Update the store
    replaceBasketHold(item.holdId, { holdId: newHold.holdId, expiresAt: newHold.expiresAt });
    return true;
  }

  async function handleChangeDates() {
    if (!newPickupDate || !newDropoffDate) return;
    const pickup = `${newPickupDate}T${newPickupTime}:00+08:00`;
    const dropoff = `${newDropoffDate}T${newDropoffTime}:00+08:00`;
    if (new Date(dropoff) <= new Date(pickup)) {
      setDateChangeError('Return date must be after pick-up date.');
      return;
    }
    setDateChangeLoading(true);
    setDateChangeError('');

    // Snapshot current basket — store may update mid-loop via replaceBasketHold
    const snapshot = useBookingStore.getState().basket;
    const results = await Promise.all(snapshot.map((item) => swapHold(item, pickup, dropoff)));

    if (results.some((r) => !r)) {
      setDateChangeError(
        "Sorry, we don't have availability for these dates. Please choose different dates or go back to browse other vehicles.",
      );
      setDateChangeLoading(false);
      return;
    }

    // All holds swapped — commit dates, locations, and addresses globally
    setDates(pickup, dropoff);
    setLocations(newPickupLocationId, newDropoffLocationId);
    const pickedPickupLoc = locations.find((l) => l.id === newPickupLocationId);
    const pickedDropoffLoc = locations.find((l) => l.id === newDropoffLocationId);
    setPickupLocationAddress(pickedPickupLoc?.locationType === 'store' ? '' : newPickupLocationAddress);
    setDropoffLocationAddress(pickedDropoffLoc?.locationType === 'store' ? '' : newDropoffLocationAddress);
    // Reset quote cache so refreshQuotes always re-fetches after any change
    lastQuotedDatesRef.current = { pickup: '', dropoff: '' };
    setChangingDates(false);
    setDateChangeError('');
    setDateChangeLoading(false);
    // refreshQuotes fires automatically via the useEffect watching pickupDatetime/dropoffDatetime
  }

  const refreshQuotes = useCallback(async () => {
    if (
      !pickupDatetime ||
      !dropoffDatetime ||
      !hasBookingDatetimeWithTime(pickupDatetime) ||
      !hasBookingDatetimeWithTime(dropoffDatetime) ||
      !pickupLocationId ||
      !dropoffLocationId ||
      basket.length === 0
    ) {
      return;
    }
    if (
      lastQuotedDatesRef.current.pickup === pickupDatetime &&
      lastQuotedDatesRef.current.dropoff === dropoffDatetime
    ) return;

    lastQuotedDatesRef.current = { pickup: pickupDatetime, dropoff: dropoffDatetime };
    let changed = false;

    for (const item of basket) {
      try {
        const params = new URLSearchParams({
          storeId,
          vehicleModelId: item.vehicleModelId,
          pickupDatetime,
          dropoffDatetime,
          pickupLocationId: String(pickupLocationId),
          dropoffLocationId: String(dropoffLocationId),
        });
        const quote = await api.get<QuoteResponse>(`/public/booking/quote?${params}`);
        if (Math.abs(quote.dailyRate - item.dailyRate) > 0.01) {
          updateBasketRate(item.holdId, quote.dailyRate, quote.securityDeposit);
          changed = true;
        }
      } catch {
        // Non-fatal: keep existing rate if quote fetch fails
      }
    }
    setPriceChanged(changed);
  }, [pickupDatetime, dropoffDatetime, pickupLocationId, dropoffLocationId, storeId, basket, updateBasketRate]);

  useEffect(() => { refreshQuotes(); }, [refreshQuotes]);

  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<number>>(new Set());
  const [ninePmRemovedNotice, setNinePmRemovedNotice] = useState(false);
  const selectedAddonIdsRef = useRef(selectedAddonIds);
  selectedAddonIdsRef.current = selectedAddonIds;
  const prevDropoffForNinePmRef = useRef<string | null>(null);

  const ninePmReturnEligible = dropoffDatetime.includes('T16:45');

  useEffect(() => {
    if (prevDropoffForNinePmRef.current === null) {
      prevDropoffForNinePmRef.current = dropoffDatetime;
      return;
    }
    const prev = prevDropoffForNinePmRef.current;
    prevDropoffForNinePmRef.current = dropoffDatetime;

    const wasEligible = prev.includes('T16:45');
    const nowEligible = dropoffDatetime.includes('T16:45');
    if (!wasEligible || nowEligible) return;

    const ninePmAddon = addons.find((a) => isNinePmReturnAddonName(a.name));
    if (!ninePmAddon) return;
    const nid = Number(ninePmAddon.id);
    if (!selectedAddonIdsRef.current.has(nid)) return;

    setSelectedAddonIds((sel) => {
      if (!sel.has(nid)) return sel;
      const next = new Set(sel);
      next.delete(nid);
      return next;
    });
    setNinePmRemovedNotice(true);
  }, [dropoffDatetime, addons]);

  useEffect(() => {
    if (!ninePmRemovedNotice) return;
    const t = window.setTimeout(() => setNinePmRemovedNotice(false), 4000);
    return () => window.clearTimeout(t);
  }, [ninePmRemovedNotice]);
  const [transfer, setTransfer] = useState<TransferDetails | null>(null);
  const [renter, setRenterRaw] = useState<RenterInfo>(storedRenterDetails);
  const renterDetailsStartedRef = useRef(false);
  const sessionPingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setRenter(info: RenterInfo) {
    setRenterRaw(info);
    setRenterDetailsInStore(info as RenterDetails);

    const hasContent = Object.values(info).some((v) => typeof v === 'string' && v.trim().length > 0);
    if (hasContent && !renterDetailsStartedRef.current) {
      renterDetailsStartedRef.current = true;
      void api.patch('/public/booking/session', { sessionToken, renterDetailsStarted: true }).catch(() => {});
    }

    if (sessionPingDebounceRef.current) clearTimeout(sessionPingDebounceRef.current);
    sessionPingDebounceRef.current = setTimeout(() => {
      void api.patch('/public/booking/session', { sessionToken, renterDetails: info }).catch(() => {});
    }, 2000);
  }

  useEffect(() => {
    if (!handoffSessionToken) {
      setHydratingSession(false);
      return;
    }

    if (sessionToken === handoffSessionToken && basket.length > 0) {
      setHydratingSession(false);
      return;
    }

    let cancelled = false;
    setHydratingSession(true);
    setHydrationError('');

    api.get<HydratedBookingSession>(
      `/public/booking/session/${encodeURIComponent(handoffSessionToken)}`,
    )
      .then((data) => {
        if (cancelled) return;

        hydrateBookingSession({
          storeId: data.storeId,
          pickupDatetime: data.pickupDatetime,
          dropoffDatetime: data.dropoffDatetime,
          pickupLocationId: data.pickupLocationId,
          dropoffLocationId: data.dropoffLocationId,
          sessionToken: data.sessionToken,
          basket: data.basket,
          renterDetails: data.renterDetails,
        });

        const nextRenter = {
          ...storedRenterDetails,
          ...(data.renterDetails ?? {}),
        } as RenterInfo;
        setRenterRaw(nextRenter);
        if (data.addonIds.length > 0) {
          setSelectedAddonIds(new Set(data.addonIds));
        }

        const transferPayload = data.transfer;
        if (
          transferPayload?.transferType &&
          transferPayload.transferRoute &&
          transferPayload.flightNumber &&
          transferPayload.flightArrivalTime
        ) {
          const pricingType = transferPayload.pricingType ?? 'fixed';
          const unitPrice = Number(transferPayload.unitPrice ?? transferPayload.totalPrice ?? 0);
          const paxCount = Number(transferPayload.paxCount ?? 1);
          setTransfer({
            transferType: transferPayload.transferType,
            transferRoute: transferPayload.transferRoute,
            flightNumber: transferPayload.flightNumber,
            flightArrivalTime: transferPayload.flightArrivalTime,
            transferRouteId: Number(transferPayload.transferRouteId ?? 0),
            vanType: transferPayload.vanType ?? transferPayload.transferType,
            pricingType,
            unitPrice,
            paxCount,
            totalPrice: Number(transferPayload.totalPrice ?? unitPrice * (pricingType === 'per_head' ? paxCount : 1)),
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'This booking link is no longer active.';
        setHydrationError(message);
      })
      .finally(() => {
        if (!cancelled) setHydratingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    handoffSessionToken,
    sessionToken,
    basket.length,
    hydrateBookingSession,
    storedRenterDetails,
  ]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});
  const [helmetCount, setHelmetCount] = useState(1);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [charityDonation, setCharityDonation] = useState(0);
  type LocFee = { id: number; name: string; deliveryCost: number; collectionCost: number; locationType: string | null };
  const [locations, setLocationList] = useState<LocFee[]>([]);
  const vehicleCount = basket.length || 1;
  const pickupFeePerVehicle = locations.find((l) => l.id === pickupLocationId)?.deliveryCost ?? 0;
  const dropoffFeePerVehicle = locations.find((l) => l.id === dropoffLocationId)?.collectionCost ?? 0;
  const pickupFee = pickupFeePerVehicle * vehicleCount;
  const dropoffFee = dropoffFeePerVehicle * vehicleCount;

  const selectedPm = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const surchargePercent = selectedPm?.surchargePercent ?? 0;

  // ── Partner referral benefit (read once on mount, recompute when dates change) ──
  const partnerBenefit = useMemo(() => getStoredPartnerBenefit(), []);
  const vehicleSubtotalForBenefit = basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0);
  // Derive singleModelId here (before appliedPartnerBenefit) so it can be used
  // in the useMemo below without hitting a temporal dead zone error. The same
  // value is also used later for add-on fetching.
  const _basketModelIds = [...new Set(basket.map((b) => b.vehicleModelId))];
  const singleModelId = _basketModelIds.length === 1 ? _basketModelIds[0] : null;
  // Pass the vehicle model ID when the basket contains a single model type so
  // per-vehicle overrides can be resolved. Mixed-model baskets fall back to
  // global partner terms (singleModelId is null when models differ).
  const appliedPartnerBenefit = useMemo(
    () => computePartnerBenefit(
      partnerBenefit,
      vehicleSubtotalForBenefit,
      pickupDatetime,
      new Date(),
      singleModelId,
      pickupLocationId,
      dropoffLocationId,
    ),
    [partnerBenefit, vehicleSubtotalForBenefit, pickupDatetime, singleModelId, pickupLocationId, dropoffLocationId],
  );
  const partnerRentalDiscount = appliedPartnerBenefit.applied ? appliedPartnerBenefit.rentalDiscount : 0;
  const partnerFreeDelivery = appliedPartnerBenefit.applied && appliedPartnerBenefit.freeDelivery;

  const [isMdUp, setIsMdUp] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsMdUp(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (isMdUp && reviewSheetOpen) setReviewSheetOpen(false);
  }, [isMdUp, reviewSheetOpen]);

  useEffect(() => {
    void api.patch('/public/booking/session', { sessionToken, basketViewed: true }).catch(() => {});
    return () => {
      if (sessionPingDebounceRef.current) clearTimeout(sessionPingDebounceRef.current);
    };
  }, [sessionToken]);

  const reviewSheetItems = useMemo(
    () =>
      basket.map((b) => ({
        modelName: b.modelName,
        dailyRate: b.dailyRate,
        rentalDays,
        pickupDatetime,
        dropoffDatetime,
      })),
    [basket, rentalDays, pickupDatetime, dropoffDatetime],
  );

  const reviewSheetAddons = useMemo(
    () =>
      addons
        .filter((a) => selectedAddonIds.has(Number(a.id)))
        .map((a) => ({ name: a.name, total: addonLineTotal(a, rentalDays) * vehicleCount })),
    [addons, selectedAddonIds, rentalDays, vehicleCount],
  );

  const reviewSheetTransfer = useMemo(() => {
    if (!transfer) return null;
    return {
      route: transfer.transferRoute,
      vanType: transfer.vanType,
      total: transfer.totalPrice,
    };
  }, [transfer]);

  const reviewSheetGrandTotal = useMemo(() => {
    const vehicleSubtotal = basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0);
    const addonsTotal = addons
      .filter((a) => selectedAddonIds.has(Number(a.id)))
      .reduce((s, a) => s + addonLineTotal(a, rentalDays), 0) * basket.length;
    const transferFee = transfer?.totalPrice ?? 0;
    const discountedVehicleSubtotal = Math.max(0, vehicleSubtotal - partnerRentalDiscount);
    const effPickup = partnerFreeDelivery ? 0 : pickupFee;
    const effDropoff = partnerFreeDelivery ? 0 : dropoffFee;
    const subtotalBeforeSurcharge =
      discountedVehicleSubtotal + addonsTotal + transferFee + effPickup + effDropoff;
    const surchargeAmount =
      surchargePercent > 0
        ? Math.round(subtotalBeforeSurcharge * (surchargePercent / 100) * 100) / 100
        : 0;
    return subtotalBeforeSurcharge + surchargeAmount + charityDonation;
  }, [
    basket,
    rentalDays,
    addons,
    selectedAddonIds,
    transfer,
    pickupFee,
    dropoffFee,
    surchargePercent,
    charityDonation,
    partnerRentalDiscount,
    partnerFreeDelivery,
  ]);

  const reviewSheetDeposit = useMemo(
    () => basket.reduce((s, b) => s + (b.securityDeposit ?? 0), 0),
    [basket],
  );

  function handleOpenMobileReview() {
    if (!validate()) return;
    setReviewSheetOpen(true);
  }
  const hasSelectedPaymentMethod =
    paymentMethodId.trim() !== '' &&
    paymentMethods.some((pm) => pm.id === paymentMethodId);

  const { toasts, pushToast } = useToast();

  const basketModelIds = _basketModelIds;

  useEffect(() => {
    if (!storeId) return;
    setAddonsLoading(true);
    const addonParams = new URLSearchParams({ storeId });
    if (singleModelId) addonParams.set('vehicleModelId', singleModelId);
    api.get<Addon[]>(`/public/booking/addons?${addonParams}`)
      .then((data) => setAddons(data))
      .catch(() => pushToast('Failed to load add-ons. Please refresh the page.', 'error'))
      .finally(() => setAddonsLoading(false));
    api.get<Array<{ id: number; name: string; deliveryCost: number; collectionCost: number; locationType: string | null }>>(`/public/booking/locations?storeId=${storeId}`)
      .then((data) => {
        // Ensure store-type location always appears first
        const sorted = [...data].sort((a, b) => {
          const aIsStore = a.locationType === 'store' ? 0 : 1;
          const bIsStore = b.locationType === 'store' ? 0 : 1;
          return aIsStore - bIsStore;
        });
        setLocationList(sorted);
      })
      .catch(() => pushToast('Failed to load delivery locations. Fees may be inaccurate.', 'error'));
    api.get<PaymentMethodOption[]>('/public/booking/payment-methods')
      .then((data) =>
        setPaymentMethods(
          data.filter(
            (pm) =>
              !pm.id.toLowerCase().includes('card') &&
              !pm.id.toLowerCase().includes('bank') &&
              !pm.name.toLowerCase().includes('bank') &&
              pm.surchargePercent === 0,
          ),
        ),
      )
      .catch(() => {
        setPaymentMethods([
          { id: 'cash', name: 'Cash on Arrival', surchargePercent: 0 },
          { id: 'gcash', name: 'GCash', surchargePercent: 0 },
        ]);
      });
  }, [storeId, singleModelId]);

  // All addons passed to AddOnsSection — it filters out transfer-named items internally
  const standardAddons = addons;

  const basketHasTuktuk = basket.some((b) =>
    b.modelName.toLowerCase().includes('tuk'),
  );
  const showHelmetSelector = !basketHasTuktuk;

  const filteredAddons = standardAddons.filter((addon) => {
    const name = addon.name.toLowerCase();
    const isPeaceOfMind = name.includes('peace') || name.includes('mind');
    if (!isPeaceOfMind) return true;
    if (basketHasTuktuk) {
      return !name.includes('scooter') && !name.includes('bike');
    }
    return !name.includes('tuk');
  });

  function toggleAddon(id: number) {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function validate(): boolean {
    const fe: Record<string, string> = {};
    if (!renter.fullName.trim()) fe.fullName = 'Name is required';
    if (!renter.email.trim() || !renter.email.includes('@')) fe.email = 'Valid email is required';
    if (!renter.phone.trim()) fe.phone = 'Phone number is required';
    if (!renter.nationality) fe.nationality = 'Nationality is required';

    const pickupLoc = locations.find((l) => l.id === pickupLocationId);
    const dropoffLoc = locations.find((l) => l.id === dropoffLocationId);
    if (pickupLoc && pickupLoc.locationType !== 'store' && !pickupLocationAddress.trim()) {
      fe.pickupLocationAddress = 'Please enter your exact pick-up address';
    }
    if (dropoffLoc && dropoffLoc.locationType !== 'store' && !dropoffLocationAddress.trim()) {
      fe.dropoffLocationAddress = 'Please enter your exact return address';
    }

    setFormErrors(fe);
    const te: Record<string, string> = {};
    if (transfer) {
      if (!transfer.flightNumber.trim()) te.flightNumber = 'Flight number is required';
      if (!transfer.flightArrivalTime) te.flightArrivalTime = 'Arrival time is required';

      // Block last-minute after-hours bookings for early morning pick-ups.
      // If it's after 5pm and the customer is booking for tomorrow before 9am,
      // there's no window to collect payment or notify the driver.
      if (transfer.flightArrivalTime) {
        const [flightDatePart, flightTimePart] = transfer.flightArrivalTime.split('T');
        if (flightDatePart && flightTimePart) {
          const now = new Date();
          const manilaDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
          const manilaHour = parseInt(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).split(':')[0], 10);
          const [yr, mo, dy] = manilaDateStr.split('-').map(Number);
          const tomorrowDate = new Date(yr, mo - 1, dy + 1);
          const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;
          if (manilaHour >= 17 && flightDatePart === tomorrowStr && flightTimePart < '09:00') {
            te.flightArrivalTime = 'This booking cannot be completed online. We close at 5pm and cannot process payment before your early morning pick-up. Please contact us directly to arrange your transfer.';
          }
        }
      }
    }
    setTransferErrors(te);

    let payErr = '';
    if (!paymentMethodId.trim() || !paymentMethods.some((pm) => pm.id === paymentMethodId)) {
      payErr = 'Please select a payment method to continue';
    }
    setPaymentMethodError(payErr);

    return (
      Object.keys(fe).length === 0 &&
      Object.keys(te).length === 0 &&
      payErr === ''
    );
  }

  async function handlePlaceOrder() {
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true;
    setSubmitting(true);
    const ninePmAddon = addons.find((a) => isNinePmReturnAddonName(a.name));
    let allAddonIds = [...selectedAddonIds];
    if (ninePmAddon && !ninePmReturnEligible) {
      const nid = Number(ninePmAddon.id);
      allAddonIds = allAddonIds.filter((id) => id !== nid);
    }
    const orderRefs: string[] = [];
    const orderIds: string[] = [];
    const submittedOrderRefs: string[] = [];
    const submittedOrderTokens: Record<string, string> = {};
    let serverTotal = 0;
    try {
      for (let i = 0; i < basket.length; i++) {
        const item = basket[i];
        const result = await api.post<{ id: string; orderReference: string; cancellationToken: string; serverQuote: number | null; charityDonation: number }>(
          '/public/booking/submit',
          {
            sessionToken, vehicleModelId: item.vehicleModelId,
            holdId: item.holdId,
            customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
            customerMobile: renter.phone.trim(),
            pickupDatetime: pickupDatetime,
            dropoffDatetime: dropoffDatetime,
            pickupLocationId, dropoffLocationId, storeId,
            addonIds: allAddonIds.length > 0 ? allAddonIds : undefined,
            transferType: transfer?.transferType ?? null,
            flightNumber: transfer?.flightNumber || undefined,
            flightArrivalTime: transfer?.flightArrivalTime
              ? toManilaDatetime(transfer.flightArrivalTime)
              : undefined,
            transferRoute: transfer?.transferRoute || undefined,
            // Additional transfer fields (Zod strips unknown fields silently)
            transferRouteId: transfer?.transferRouteId ?? undefined,
            transferPaxCount: transfer?.paxCount ?? undefined,
            charityDonation: i === 0 && charityDonation > 0 ? charityDonation : undefined,
            transferAmount: (transfer?.totalPrice ?? 0) > 0 ? (transfer?.totalPrice ?? 0) : undefined,
            webPaymentMethod: paymentMethodId || undefined,
            ...(showHelmetSelector ? { helmet_count: helmetCount } : {}),
            ...(renter.accommodationName?.trim()
              ? { accommodationName: renter.accommodationName.trim() }
              : {}),
            ...(renter.company?.trim()
              ? { company: renter.company.trim() }
              : {}),
            ...(renter.extraComments?.trim()
              ? { extraComments: renter.extraComments.trim() }
              : {}),
            ...(pickupLocationAddress.trim()
              ? { pickupLocationAddress: pickupLocationAddress.trim() }
              : {}),
            ...(dropoffLocationAddress.trim()
              ? { dropoffLocationAddress: dropoffLocationAddress.trim() }
              : {}),
            ...(getPartnerRef() ? { partnerRef: getPartnerRef() } : {}),
          },
        );
        orderRefs.push(result.orderReference);
        orderIds.push(result.id);
        submittedOrderRefs.push(result.orderReference);
        if (result.cancellationToken) submittedOrderTokens[result.orderReference] = result.cancellationToken;
        if (result.serverQuote != null) serverTotal += result.serverQuote;
      }
      // serverTotal = webQuoteRaw from API = rental + fees + addons + transfer + charity
      // Do NOT add pickupFee/dropoffFee again — already included in webQuoteRaw
      const submittedAddonIds = new Set(allAddonIds);
      const selAddons = addons.filter((a) => submittedAddonIds.has(Number(a.id)));
      const clientTotal = basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0)
        + selAddons.reduce((s, a) => s + (a.addonType === 'per_day' ? a.pricePerDay * rentalDays : a.priceOneTime), 0) * basket.length
        + (transfer?.totalPrice ?? 0)
        + pickupFee + dropoffFee;
      const baseTotal = serverTotal > 0 ? serverTotal : clientTotal;
      const surchargeAmount = surchargePercent > 0
        ? Math.round(baseTotal * (surchargePercent / 100) * 100) / 100
        : 0;
      const grandTotal = baseTotal + surchargeAmount;
      // Persist email for confirmation page refresh/bookmark recovery
      sessionStorage.setItem(`confirm_email_${orderRefs[0]}`, renter.email.trim());
      clearPartnerRef();
      const confirmState = {
        orderReferences: orderRefs, customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
        vehicleModelName: basket[0]?.modelName ?? '', pickupDatetime, dropoffDatetime, pickupLocationId, rentalDays,
        grandTotal,
        depositAmount: basket.reduce((s, b) => s + (b.securityDeposit ?? 0), 0),
        addonNames: selAddons.map((a) => a.name), transferType: transfer?.transferType ?? null,
        flightNumber: transfer?.flightNumber ?? null, transferRoute: transfer?.transferRoute ?? null,
        transferPrice: (transfer?.totalPrice ?? 0) > 0 ? (transfer?.totalPrice ?? 0) : undefined,
        charityDonation,
      };
      const isCardPayment = surchargePercent > 0;
      if (isCardPayment && orderIds[0]) {
        // Store confirmation state in sessionStorage for when Maya redirects back
        sessionStorage.setItem(
          `confirm_state_${orderRefs[0]}`,
          JSON.stringify(confirmState),
        );
        try {
          const mayaResult = await api.post<{ checkoutId: string; redirectUrl: string }>(
            '/payments/maya/checkout',
            {
              orderId: orderIds[0],
              amountPHP: grandTotal,
              description: `Lola's Rentals – ${orderRefs[0]}`,
            },
          );
          resetBookingSession();
          clearRenterDetails();
          window.location.href = mayaResult.redirectUrl;
        } catch {
          // If Maya checkout fails, fall back to normal confirmation
          resetBookingSession();
          clearRenterDetails();
          navigate(`/book/confirmation/${encodeURIComponent(orderRefs[0])}`, { state: confirmState });
        }
      } else {
        resetBookingSession();
        clearRenterDetails();
        navigate(`/book/confirmation/${encodeURIComponent(orderRefs[0])}`, { state: confirmState });
      }
    } catch (err: unknown) {
      // Rollback: cancel any orders already submitted before the failure
      for (const ref of submittedOrderRefs) {
        try {
          const cancelToken = submittedOrderTokens[ref];
          await api.patch(`/public/booking/cancel/${encodeURIComponent(ref)}?token=${encodeURIComponent(cancelToken ?? '')}`, {});
        } catch {
          // Best effort — ignore individual cancel failures
        }
      }
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      pushToast(msg, 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (hydratingSession) {
    return (
      <PageLayout title="Cart | Lola's Rentals">
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
        </div>
      </PageLayout>
    );
  }

  if (basket.length === 0) {
    return (
      <>
        <SEO
          noIndex
          title="Your Cart | Lola's Rentals"
          description="Review your vehicle selection and complete your Lola's Rentals booking for Siargao."
        />
      <PageLayout title="Cart | Lola's Rentals">
        <div className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-2">
          <HeroFloatingClouds variant="functional" />
          <div className="relative z-10 flex flex-col items-center">
            <img src={pawPrint} alt="" className="mb-6 h-16 w-16 bg-transparent opacity-20 grayscale" />
            <h2 className="mb-2 text-center font-headline text-3xl font-black text-charcoal-brand">Your cart is empty</h2>
            <p className="font-lato mb-8 text-center text-charcoal-brand/60">
              {hydrationError || 'Find your perfect ride and add it to your cart'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/book/reserve')}
              className="font-lato"
              style={{
                backgroundColor: '#FCBC5A',
                color: '#363737',
                border: '2px solid #363737',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '14px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                boxShadow: '3px 3px 0 #363737',
                padding: '12px 32px',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translate(-2px, -2px)';
                e.currentTarget.style.boxShadow = '5px 5px 0 #363737';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '3px 3px 0 #363737';
              }}
            >
              Browse Vehicles
            </button>
          </div>
        </div>
      </PageLayout>
      </>
    );
  }

  return (
    <>
      <SEO
        noIndex
        title="Your Cart | Lola's Rentals"
        description="Review your vehicle selection and complete your Lola's Rentals booking for Siargao."
      />
    <PageLayout title="Cart | Lola's Rentals" hideBackToTop>
      <div className="relative mx-auto max-w-[1100px] px-4">
        <HeroFloatingClouds variant="functional" />
        <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">

          {/* ── LEFT COLUMN (form sections) — first on mobile & left column on lg ── */}
          <div className="order-1 space-y-6">

            {/* Your Selection */}
            <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-medium text-charcoal-brand">Your Selection</h2>
                {!changingDates && (
                  <button
                    type="button"
                    onClick={() => {
                      // Pre-fill with current dates if they exist, otherwise blank
                      const [pd = '', pt = '09:15'] = pickupDatetime
                        ? [pickupDatetime.slice(0, 10), pickupDatetime.slice(11, 16)]
                        : [];
                      const [dd = '', dt = '09:15'] = dropoffDatetime
                        ? [dropoffDatetime.slice(0, 10), dropoffDatetime.slice(11, 16)]
                        : [];
                      setNewPickupDate(pd);
                      setNewPickupTime(TIME_SLOTS.find((s) => s.value === pt) ? pt : '09:15');
                      setNewDropoffDate(dd);
                      setNewDropoffTime(TIME_SLOTS.find((s) => s.value === dt) ? dt : '09:15');
                      setNewPickupLocationId(pickupLocationId);
                      setNewDropoffLocationId(dropoffLocationId);
                      setNewPickupLocationAddress(pickupLocationAddress);
                      setNewDropoffLocationAddress(dropoffLocationAddress);
                      setDateChangeError('');
                      setChangingDates(true);
                    }}
                    className="font-lato text-xs font-semibold text-teal-brand underline underline-offset-2 transition-opacity hover:opacity-70"
                  >
                    Change dates &amp; locations
                  </button>
                )}
              </div>

              {/* Date & location change panel */}
              {changingDates && (
                <div className="mb-5 rounded-lg border border-teal-brand/20 bg-sand-brand/40 p-4 space-y-4">
                  <p className="font-lato text-sm font-semibold text-charcoal-brand">Update dates &amp; locations</p>

                  {/* Pick-up date row */}
                  <div className="space-y-1.5">
                    <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                      Pick-up date
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newPickupDate}
                        min={todayDate()}
                        onChange={(e) => {
                          setNewPickupDate(e.target.value);
                          if (newDropoffDate && e.target.value > newDropoffDate) {
                            setNewDropoffDate(e.target.value);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                      />
                      <select
                        value={newPickupTime}
                        onChange={(e) => setNewPickupTime(e.target.value)}
                        className="w-[110px] shrink-0 rounded-lg border border-charcoal-brand/15 bg-white px-2 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                      >
                        {TIME_SLOTS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Pick-up location row */}
                  {locations.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                        Pick-up location
                      </label>
                      <div className="relative">
                        <select
                          value={newPickupLocationId ?? ''}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setNewPickupLocationId(id);
                            const loc = locations.find((l) => l.id === id);
                            if (loc?.locationType === 'store') setNewPickupLocationAddress('');
                          }}
                          className="w-full appearance-none rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                        >
                          <option value="">Select location…</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                      </div>
                      {newPickupLocationId != null && (locations.find((l) => l.id === newPickupLocationId)?.deliveryCost ?? 0) > 0 && (
                        <p className="font-lato text-[11px] font-semibold text-teal-brand">
                          Delivery fee: <PesoSign />{(locations.find((l) => l.id === newPickupLocationId)!.deliveryCost).toLocaleString()}
                        </p>
                      )}
                      {newPickupLocationId != null && locations.find((l) => l.id === newPickupLocationId)?.locationType !== 'store' && (
                        <div className="mt-1">
                          <input
                            type="text"
                            value={newPickupLocationAddress}
                            onChange={(e) => setNewPickupLocationAddress(e.target.value)}
                            placeholder="Enter your exact address (e.g. Kermit Resort, Cloud 9)"
                            maxLength={500}
                            className="w-full rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand placeholder:text-charcoal-brand/30 outline-none focus:ring-2 focus:ring-teal-brand"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Return date row */}
                  <div className="space-y-1.5">
                    <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                      Return date
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newDropoffDate}
                        min={newPickupDate || todayDate()}
                        onChange={(e) => setNewDropoffDate(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                      />
                      <select
                        value={newDropoffTime}
                        onChange={(e) => setNewDropoffTime(e.target.value)}
                        className="w-[110px] shrink-0 rounded-lg border border-charcoal-brand/15 bg-white px-2 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                      >
                        {TIME_SLOTS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Return location row */}
                  {locations.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                        Return location
                      </label>
                      <div className="relative">
                        <select
                          value={newDropoffLocationId ?? ''}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setNewDropoffLocationId(id);
                            const loc = locations.find((l) => l.id === id);
                            if (loc?.locationType === 'store') setNewDropoffLocationAddress('');
                          }}
                          className="w-full appearance-none rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand outline-none focus:ring-2 focus:ring-teal-brand"
                        >
                          <option value="">Select location…</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-2.5 text-charcoal-brand/40 text-xs">▾</span>
                      </div>
                      {newDropoffLocationId != null && (locations.find((l) => l.id === newDropoffLocationId)?.collectionCost ?? 0) > 0 && (
                        <p className="font-lato text-[11px] font-semibold text-teal-brand">
                          Collection fee: <PesoSign />{(locations.find((l) => l.id === newDropoffLocationId)!.collectionCost).toLocaleString()}
                        </p>
                      )}
                      {newDropoffLocationId != null && locations.find((l) => l.id === newDropoffLocationId)?.locationType !== 'store' && (
                        <div className="mt-1">
                          <input
                            type="text"
                            value={newDropoffLocationAddress}
                            onChange={(e) => setNewDropoffLocationAddress(e.target.value)}
                            placeholder="Enter your exact address (e.g. Kermit Resort, Cloud 9)"
                            maxLength={500}
                            className="w-full rounded-lg border border-charcoal-brand/15 bg-white px-3 py-2 font-lato text-sm text-charcoal-brand placeholder:text-charcoal-brand/30 outline-none focus:ring-2 focus:ring-teal-brand"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {dateChangeError && (
                    <p className="font-lato text-xs font-medium text-red-600">{dateChangeError}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={dateChangeLoading}
                      onClick={() => {
                        setChangingDates(false);
                        setDateChangeError('');
                      }}
                      className="flex-1 rounded-[6px] border-2 border-charcoal-brand/30 bg-white font-lato text-xs font-extrabold uppercase tracking-[0.05em] text-charcoal-brand/70 transition-colors hover:border-charcoal-brand/60 hover:text-charcoal-brand disabled:opacity-40"
                      style={{ padding: '10px 16px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={dateChangeLoading || !newPickupDate || !newDropoffDate || (locations.length > 0 && (!newPickupLocationId || !newDropoffLocationId))}
                      onClick={() => { void handleChangeDates(); }}
                      className="flex-[2] rounded-[6px] border-2 border-charcoal-brand bg-gold-brand font-lato text-xs font-extrabold uppercase tracking-[0.05em] text-charcoal-brand transition-all duration-150 disabled:pointer-events-none disabled:opacity-40"
                      style={{ padding: '10px 16px', boxShadow: dateChangeLoading || !newPickupDate || !newDropoffDate ? 'none' : '3px 3px 0 #363737' }}
                    >
                      {dateChangeLoading ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
                          Checking…
                        </span>
                      ) : 'Confirm changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* Location addresses — shown when not changing dates and a non-store location is selected */}
              {!changingDates && locations.length > 0 && (
                (() => {
                  const pickupLoc = locations.find((l) => l.id === pickupLocationId);
                  const dropoffLoc = locations.find((l) => l.id === dropoffLocationId);
                  const needsPickupAddr = pickupLoc && pickupLoc.locationType !== 'store';
                  const needsDropoffAddr = dropoffLoc && dropoffLoc.locationType !== 'store';
                  if (!needsPickupAddr && !needsDropoffAddr) return null;
                  return (
                    <div className="mb-4 space-y-3 rounded-lg border border-teal-brand/20 bg-sand-brand/30 p-4">
                      {needsPickupAddr && (
                        <div className="space-y-1">
                          <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                            Pick-up address
                          </label>
                          <p className="font-lato text-xs text-charcoal-brand/50">
                            You've selected <span className="font-semibold">{pickupLoc.name}</span> — please enter your exact pick-up address.
                          </p>
                          <input
                            type="text"
                            value={pickupLocationAddress}
                            onChange={(e) => {
                              setPickupLocationAddress(e.target.value);
                              if (formErrors.pickupLocationAddress) {
                                setFormErrors((prev) => { const next = { ...prev }; delete next.pickupLocationAddress; return next; });
                              }
                            }}
                            placeholder="e.g. Kermit Resort, Cloud 9, General Luna"
                            maxLength={500}
                            className={`w-full rounded-lg border bg-white px-3 py-2 font-lato text-sm text-charcoal-brand placeholder:text-charcoal-brand/30 outline-none focus:ring-2 ${formErrors.pickupLocationAddress ? 'border-red-400 focus:ring-red-400/20' : 'border-charcoal-brand/15 focus:ring-teal-brand'}`}
                          />
                          {formErrors.pickupLocationAddress && (
                            <p className="font-lato text-[11px] font-semibold text-red-500">{formErrors.pickupLocationAddress}</p>
                          )}
                        </div>
                      )}
                      {needsDropoffAddr && (
                        <div className="space-y-1">
                          <label className="font-lato text-[11px] font-bold uppercase tracking-wide text-charcoal-brand/55">
                            Return address
                          </label>
                          <p className="font-lato text-xs text-charcoal-brand/50">
                            You've selected <span className="font-semibold">{dropoffLoc.name}</span> — please enter your exact return address.
                          </p>
                          <input
                            type="text"
                            value={dropoffLocationAddress}
                            onChange={(e) => {
                              setDropoffLocationAddress(e.target.value);
                              if (formErrors.dropoffLocationAddress) {
                                setFormErrors((prev) => { const next = { ...prev }; delete next.dropoffLocationAddress; return next; });
                              }
                            }}
                            placeholder="e.g. Kermit Resort, Cloud 9, General Luna"
                            maxLength={500}
                            className={`w-full rounded-lg border bg-white px-3 py-2 font-lato text-sm text-charcoal-brand placeholder:text-charcoal-brand/30 outline-none focus:ring-2 ${formErrors.dropoffLocationAddress ? 'border-red-400 focus:ring-red-400/20' : 'border-charcoal-brand/15 focus:ring-teal-brand'}`}
                          />
                          {formErrors.dropoffLocationAddress && (
                            <p className="font-lato text-[11px] font-semibold text-red-500">{formErrors.dropoffLocationAddress}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              <div className="space-y-4">
                {Object.values(
                  basket.reduce<Record<string, typeof basket>>((acc, item) => {
                    const key = item.vehicleModelId;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(item);
                    return acc;
                  }, {}),
                ).map((group) => (
                  <BasketVehicleGroupCard
                    key={group[0].vehicleModelId}
                    items={group}
                    rentalDays={rentalDays}
                    pickupLabel={formatDate(pickupDatetime)}
                    dropoffLabel={formatDate(dropoffDatetime)}
                    onToast={pushToast}
                  />
                ))}
              </div>
            </div>

            {/* Enhance Your Journey */}
            <FadeUpSection>
              <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
                <h2 className="mb-4 text-[15px] font-medium text-charcoal-brand">Enhance Your Journey</h2>
                <AddOnsSection
                  addons={filteredAddons}
                  loading={addonsLoading}
                  selectedIds={selectedAddonIds}
                  onToggle={toggleAddon}
                  ninePmReturnEligible={ninePmReturnEligible}
                  ninePmRemovedNotice={ninePmRemovedNotice}
                  onDismissNinePmRemovedNotice={() => setNinePmRemovedNotice(false)}
                />
              </div>
            </FadeUpSection>

            {/* Need a Transfer? */}
            <FadeUpSection>
              <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
                <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
                  <h2 className="text-[15px] font-medium text-charcoal-brand">Need a Transfer?</h2>
                  <span className="text-[13px] font-medium text-charcoal-brand/55">
                    IAO Airport → General Luna
                  </span>
                </div>
                <TransferSection transfer={transfer} onTransferChange={setTransfer} errors={transferErrors} />
              </div>
            </FadeUpSection>

            {/* Renter Details */}
            <FadeUpSection>
              <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
                <h2 className="mb-4 text-[15px] font-medium text-charcoal-brand">Renter Details</h2>
                <RenterDetailsForm info={renter} onChange={setRenter} errors={formErrors} />
              </div>
            </FadeUpSection>

            {showHelmetSelector && (
              <FadeUpSection>
                <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
                  <h2 className="mb-1 text-[15px] font-medium text-charcoal-brand">Helmets</h2>
                  <p className="mb-4 text-[13px] leading-relaxed text-charcoal-brand/60">
                    One sanitised helmet included. Add a second?
                  </p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-charcoal-brand/[0.12] bg-sand-brand/20 px-4 py-3 transition-colors hover:bg-sand-brand/35">
                    <input
                      type="checkbox"
                      checked={helmetCount === 2}
                      onChange={(e) => setHelmetCount(e.target.checked ? 2 : 1)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-charcoal-brand/25 text-teal-brand focus:ring-teal-brand"
                    />
                    <span className="text-[13px] font-medium leading-snug text-charcoal-brand">
                      Request an additional helmet
                    </span>
                  </label>
                </div>
              </FadeUpSection>
            )}
          </div>

          {/* ── RIGHT COLUMN (summary + payment) — below main on mobile, sticky sidebar on lg ── */}
          <div className="order-2 lg:sticky lg:top-20 lg:self-start">
            <OrderSummaryPanel
              basket={basket} rentalDays={rentalDays} selectedAddonIds={selectedAddonIds} addons={standardAddons}
              transfer={transfer} pickupFee={pickupFee} dropoffFee={dropoffFee} vehicleCount={vehicleCount}
              paymentMethodId={paymentMethodId}
              onPaymentChange={(id) => {
                setPaymentMethodId(id);
                setPaymentMethodError('');
              }}
              paymentMethods={paymentMethods} surchargePercent={surchargePercent}
              onPlaceOrder={handlePlaceOrder} submitting={submitting}
              paymentMethodError={paymentMethodError}
              canPlaceOrder={hasSelectedPaymentMethod && paymentMethods.length > 0}
              priceChanged={priceChanged}
              charityDonation={charityDonation}
              onCharityChange={setCharityDonation}
              isMdUp={isMdUp}
              onOpenMobileReview={handleOpenMobileReview}
              partnerBenefit={partnerBenefit}
              partnerBenefitApplied={appliedPartnerBenefit}
            />
          </div>
        </div>
      </div>

      <OrderReviewSheet
        open={reviewSheetOpen}
        onClose={() => setReviewSheetOpen(false)}
        onConfirm={() => {
          void handlePlaceOrder();
        }}
        submitting={submitting}
        items={reviewSheetItems}
        addons={reviewSheetAddons}
        transfer={reviewSheetTransfer}
        grandTotal={reviewSheetGrandTotal}
        paymentMethodLabel={selectedPm?.name ?? '—'}
        depositAmount={reviewSheetDeposit}
      />

      <div className="fixed bottom-28 left-4 right-4 z-[60] flex flex-col-reverse items-stretch gap-2 md:bottom-8 md:left-auto md:right-8 md:items-end">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-toast-slide-up rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${t.type === 'success' ? 'bg-teal-brand text-white' : 'bg-red-600 text-white'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </PageLayout>
    </>
  );
}
