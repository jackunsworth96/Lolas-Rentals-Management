import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { useToast } from '../../hooks/useToast.js';
import { BasketVehicleCard } from '../../components/basket/BasketVehicleCard.js';
import { AddOnsSection, isNinePmReturnAddonName } from '../../components/basket/AddOnsSection.js';
import { TransferSection } from '../../components/basket/TransferSection.js';
import { RenterDetailsForm } from '../../components/basket/RenterDetailsForm.js';
import { OrderSummaryPanel } from '../../components/basket/OrderSummaryPanel.js';
import { OrderReviewSheet } from '../../components/basket/OrderReviewSheet.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import type { Addon, TransferDetails, RenterInfo, PaymentMethodOption } from '../../components/basket/basket-types.js';

import pawPrint from '../../assets/Paw Print.svg';
import { hasBookingDatetimeWithTime } from '../../utils/booking-datetime.js';

interface QuoteResponse {
  dailyRate: number;
  securityDeposit: number;
  grandTotal: number;
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

  const basket = useBookingStore((s) => s.basket);
  const storeId = useBookingStore((s) => s.storeId);
  const pickupDatetime = useBookingStore((s) => s.pickupDatetime);
  const dropoffDatetime = useBookingStore((s) => s.dropoffDatetime);
  const pickupLocationId = useBookingStore((s) => s.pickupLocationId);
  const dropoffLocationId = useBookingStore((s) => s.dropoffLocationId);
  const sessionToken = useBookingStore((s) => s.sessionToken);
  const clearBasket = useBookingStore((s) => s.clearBasket);
  const updateBasketRate = useBookingStore((s) => s.updateBasketRate);

  const rentalDays = rentalDaysFromDates(pickupDatetime, dropoffDatetime);

  const [priceChanged, setPriceChanged] = useState(false);
  const lastQuotedDatesRef = useRef({ pickup: '', dropoff: '' });

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
  const [renter, setRenter] = useState<RenterInfo>({ fullName: '', email: '', phone: '', nationality: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});
  const [helmetCount, setHelmetCount] = useState(1);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [charityDonation, setCharityDonation] = useState(0);
  type LocFee = { id: number; deliveryCost: number; collectionCost: number };
  const [locations, setLocations] = useState<LocFee[]>([]);
  const pickupFee = locations.find((l) => l.id === pickupLocationId)?.deliveryCost ?? 0;
  const dropoffFee = locations.find((l) => l.id === dropoffLocationId)?.collectionCost ?? 0;

  const selectedPm = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const surchargePercent = selectedPm?.surchargePercent ?? 0;

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
        .map((a) => ({ name: a.name, total: addonLineTotal(a, rentalDays) })),
    [addons, selectedAddonIds, rentalDays],
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
      .reduce((s, a) => s + addonLineTotal(a, rentalDays), 0);
    const transferFee = transfer?.totalPrice ?? 0;
    const subtotalBeforeSurcharge =
      vehicleSubtotal + addonsTotal + transferFee + pickupFee + dropoffFee;
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

  const basketModelIds = [...new Set(basket.map((b) => b.vehicleModelId))];
  const singleModelId = basketModelIds.length === 1 ? basketModelIds[0] : null;

  useEffect(() => {
    if (!storeId) return;
    setAddonsLoading(true);
    const addonParams = new URLSearchParams({ storeId });
    if (singleModelId) addonParams.set('vehicleModelId', singleModelId);
    api.get<Addon[]>(`/public/booking/addons?${addonParams}`)
      .then((data) => setAddons(data))
      .catch(() => pushToast('Failed to load add-ons. Please refresh the page.', 'error'))
      .finally(() => setAddonsLoading(false));
    api.get<Array<{ id: number; deliveryCost: number; collectionCost: number }>>(`/public/booking/locations?storeId=${storeId}`)
      .then((data) => setLocations(data))
      .catch(() => pushToast('Failed to load delivery locations. Fees may be inaccurate.', 'error'));
    api.get<PaymentMethodOption[]>('/public/booking/payment-methods')
      .then((data) => setPaymentMethods(data))
      .catch(() => {
        setPaymentMethods([
          { id: 'cash', name: 'Cash on Arrival', surchargePercent: 0 },
          { id: 'gcash', name: 'GCash', surchargePercent: 0 },
          { id: 'card', name: 'Credit / Debit Card', surchargePercent: 0 },
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
    setFormErrors(fe);
    const te: Record<string, string> = {};
    if (transfer) {
      if (!transfer.flightNumber.trim()) te.flightNumber = 'Flight number is required';
      if (!transfer.flightArrivalTime) te.flightArrivalTime = 'Arrival time is required';
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
    if (!validate()) return;
    setSubmitting(true);
    const ninePmAddon = addons.find((a) => isNinePmReturnAddonName(a.name));
    let allAddonIds = [...selectedAddonIds];
    if (ninePmAddon && !ninePmReturnEligible) {
      const nid = Number(ninePmAddon.id);
      allAddonIds = allAddonIds.filter((id) => id !== nid);
    }
    const orderRefs: string[] = [];
    let serverTotal = 0;
    try {
      for (const item of basket) {
        const result = await api.post<{ id: string; orderReference: string; serverQuote: number | null; charityDonation: number }>(
          '/public/booking/submit',
          {
            sessionToken, vehicleModelId: item.vehicleModelId,
            customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
            customerMobile: renter.phone.trim(),
            pickupDatetime: pickupDatetime,
            dropoffDatetime: dropoffDatetime,
            pickupLocationId, dropoffLocationId, storeId,
            addonIds: allAddonIds.length > 0 ? allAddonIds : undefined,
            transferType: transfer?.transferType ?? null,
            flightNumber: transfer?.flightNumber || undefined,
            flightArrivalTime: transfer?.flightArrivalTime || undefined,
            transferRoute: transfer?.transferRoute || undefined,
            // Additional transfer fields (Zod strips unknown fields silently)
            transferRouteId: transfer?.transferRouteId ?? undefined,
            transferPaxCount: transfer?.paxCount ?? undefined,
            charityDonation: charityDonation > 0 ? charityDonation : undefined,
            webPaymentMethod: paymentMethodId || undefined,
            ...(showHelmetSelector ? { helmet_count: helmetCount } : {}),
          },
        );
        orderRefs.push(result.orderReference);
        if (result.serverQuote != null) serverTotal += result.serverQuote;
      }
      const submittedAddonIds = new Set(allAddonIds);
      const selAddons = addons.filter((a) => submittedAddonIds.has(Number(a.id)));
      const clientTotal = basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0)
        + selAddons.reduce((s, a) => s + (a.addonType === 'per_day' ? a.pricePerDay * rentalDays : a.priceOneTime), 0)
        + (transfer?.totalPrice ?? 0)
        + pickupFee + dropoffFee;
      const baseTotal = serverTotal > 0 ? serverTotal : clientTotal;
      const surchargeAmount = surchargePercent > 0
        ? Math.round(baseTotal * (surchargePercent / 100) * 100) / 100
        : 0;
      const grandTotal = baseTotal + surchargeAmount;
      clearBasket();
      const confirmState = {
        orderReferences: orderRefs, customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
        vehicleModelName: basket[0]?.modelName ?? '', pickupDatetime, dropoffDatetime, pickupLocationId, rentalDays,
        grandTotal,
        depositAmount: basket.reduce((s, b) => s + (b.securityDeposit ?? 0), 0),
        addonNames: selAddons.map((a) => a.name), transferType: transfer?.transferType ?? null,
        flightNumber: transfer?.flightNumber ?? null, transferRoute: transfer?.transferRoute ?? null,
        charityDonation,
      };
      navigate(`/book/confirmation/${encodeURIComponent(orderRefs[0])}`, { state: confirmState });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      pushToast(msg, 'error');
    } finally { setSubmitting(false); }
  }

  if (basket.length === 0) {
    return (
      <PageLayout title="Basket | Lola's Rentals">
        <div className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-2">
          <HeroFloatingClouds variant="functional" />
          <div className="relative z-10 flex flex-col items-center">
            <img src={pawPrint} alt="" className="mb-6 h-16 w-16 bg-transparent opacity-20 grayscale" />
            <h2 className="mb-2 text-center font-headline text-3xl font-black text-charcoal-brand">Your basket is empty</h2>
            <p className="font-lato mb-8 text-center text-charcoal-brand/60">Find your perfect ride and add it to your basket</p>
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
    );
  }

  return (
    <PageLayout title="Basket | Lola's Rentals">
      <div className="relative mx-auto max-w-[1100px]">
        <HeroFloatingClouds variant="functional" />
        <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">

          {/* ── LEFT COLUMN (form sections) — first on mobile & left column on lg ── */}
          <div className="order-1 space-y-6">

            {/* Your Selection */}
            <div className="rounded-xl border border-charcoal-brand/10 bg-white p-5 md:p-6">
              <h2 className="mb-4 text-[15px] font-medium text-charcoal-brand">Your Selection</h2>
              <div className="space-y-4">
                {basket.map((item) => (
                  <BasketVehicleCard key={item.holdId} item={item} rentalDays={rentalDays} pickupLabel={formatDate(pickupDatetime)} dropoffLabel={formatDate(dropoffDatetime)} onToast={pushToast} />
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

          {/* ── RIGHT COLUMN (summary + payment) — below main on mobile, sidebar on lg ── */}
          <div className="order-2">
            <OrderSummaryPanel
              basket={basket} rentalDays={rentalDays} selectedAddonIds={selectedAddonIds} addons={standardAddons}
              transfer={transfer} pickupFee={pickupFee} dropoffFee={dropoffFee}
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
  );
}
