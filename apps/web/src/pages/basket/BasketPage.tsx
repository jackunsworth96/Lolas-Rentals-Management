import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { BasketVehicleCard } from '../../components/basket/BasketVehicleCard.js';
import { AddOnsSection } from '../../components/basket/AddOnsSection.js';
import { TransferSection } from '../../components/basket/TransferSection.js';
import { RenterDetailsForm } from '../../components/basket/RenterDetailsForm.js';
import { OrderSummaryPanel } from '../../components/basket/OrderSummaryPanel.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import type { Addon, TransferDetails, RenterInfo, PaymentMethod } from '../../components/basket/basket-types.js';

import pawPrint from '../../assets/Paw Print.svg';

function rentalDaysFromDates(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 1;
  const ms = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Toast { msg: string; type: 'success' | 'error'; id: number }

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

  const rentalDays = rentalDaysFromDates(pickupDatetime, dropoffDatetime);

  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<number>>(new Set());
  const [transfer, setTransfer] = useState<TransferDetails | null>(null);
  const [renter, setRenter] = useState<RenterInfo>({ fullName: '', email: '', phone: '', nationality: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  type LocFee = { id: number; deliveryCost: number; collectionCost: number };
  const [locations, setLocations] = useState<LocFee[]>([]);
  const pickupFee = locations.find((l) => l.id === pickupLocationId)?.deliveryCost ?? 0;
  const dropoffFee = locations.find((l) => l.id === dropoffLocationId)?.collectionCost ?? 0;

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { msg, type, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setAddonsLoading(true);
    api.get<Addon[]>(`/public/booking/addons?storeId=${storeId}`)
      .then((data) => setAddons(data))
      .catch(() => { /* silent */ })
      .finally(() => setAddonsLoading(false));
    api.get<Array<{ id: number; deliveryCost: number; collectionCost: number }>>(`/public/booking/locations?storeId=${storeId}`)
      .then((data) => setLocations(data))
      .catch(() => { /* silent */ });
  }, [storeId]);

  const transferAddons = addons.filter((a) => a.name.toLowerCase().includes('transfer') || a.name.toLowerCase().includes('tuk'));
  const standardAddons = addons.filter((a) => !transferAddons.includes(a));

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
      if (!transfer.transferRoute) te.transferRoute = 'Route is required';
    }
    setTransferErrors(te);
    return Object.keys(fe).length === 0 && Object.keys(te).length === 0;
  }

  async function handlePlaceOrder() {
    if (!validate()) return;
    setSubmitting(true);
    const allAddonIds = [...selectedAddonIds];
    if (transfer) {
      const tAddon = transferAddons.find((a) =>
        transfer.transferType === 'shared'
          ? a.name.toLowerCase().includes('shared')
          : a.name.toLowerCase().includes('private') || a.name.toLowerCase().includes('tuk'),
      );
      if (tAddon) allAddonIds.push(Number(tAddon.id));
    }
    const orderRefs: string[] = [];
    try {
      for (const item of basket) {
        const result = await api.post<{ id: string; orderReference: string }>(
          '/public/booking/submit',
          {
            sessionToken, vehicleModelId: item.vehicleModelId,
            customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
            customerMobile: renter.phone.trim(), pickupDatetime, dropoffDatetime,
            pickupLocationId, dropoffLocationId, storeId,
            addonIds: allAddonIds.length > 0 ? allAddonIds : undefined,
            transferType: transfer?.transferType ?? null,
            flightNumber: transfer?.flightNumber || undefined,
            flightArrivalTime: transfer?.flightArrivalTime || undefined,
            transferRoute: transfer?.transferRoute || undefined,
          },
        );
        orderRefs.push(result.orderReference);
      }
      const selAddons = addons.filter((a) => selectedAddonIds.has(Number(a.id)));
      const addonsCost = selAddons.reduce((s, a) => s + (a.addonType === 'per_day' ? a.pricePerDay * rentalDays : a.priceOneTime), 0);
      const tFee = transfer ? (transferAddons.find((a) => (transfer.transferType === 'shared' ? a.name.toLowerCase().includes('shared') : a.name.toLowerCase().includes('tuk')))?.priceOneTime ?? 0) : 0;
      clearBasket();
      navigate('/confirmation', { state: {
        orderReferences: orderRefs, customerName: renter.fullName.trim(), customerEmail: renter.email.trim(),
        vehicleModelName: basket[0]?.modelName ?? '', pickupDatetime, dropoffDatetime, pickupLocationId, rentalDays,
        grandTotal: basket.reduce((s, b) => s + b.dailyRate * rentalDays, 0) + addonsCost + tFee + pickupFee + dropoffFee,
        depositAmount: basket.reduce((s, b) => s + (b.securityDeposit ?? 0), 0),
        addonNames: selAddons.map((a) => a.name), transferType: transfer?.transferType ?? null,
        flightNumber: transfer?.flightNumber ?? null, transferRoute: transfer?.transferRoute ?? null,
      }});
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
            <p className="mb-8 text-center text-charcoal-brand/60">Find your perfect ride and add it to your basket</p>
            <PrimaryCtaButton type="button" onClick={() => navigate('/browse-book')} className="min-h-[44px] px-10 py-4 font-bold">
              Browse Vehicles
            </PrimaryCtaButton>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Basket | Lola's Rentals">
      <div className="relative mx-auto max-w-5xl overflow-hidden">
        <HeroFloatingClouds variant="functional" />
        <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-7">
            <section>
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">🏍️</span>
                <h2 className="font-headline text-3xl font-black text-charcoal-brand">Your Selection</h2>
              </div>
              <div className="space-y-6">
                {basket.map((item) => (
                  <BasketVehicleCard key={item.holdId} item={item} rentalDays={rentalDays} pickupLabel={formatDate(pickupDatetime)} dropoffLabel={formatDate(dropoffDatetime)} onToast={pushToast} />
                ))}
              </div>
            </section>

            <PawDivider size="sm" />

            <FadeUpSection>
              <section>
                <h2 className="mb-6 font-headline text-2xl font-black italic text-charcoal-brand">Enhance Your Journey</h2>
                <AddOnsSection addons={standardAddons} loading={addonsLoading} selectedIds={selectedAddonIds} onToggle={toggleAddon} />
              </section>
            </FadeUpSection>

            {transferAddons.length > 0 && (
              <FadeUpSection>
                <section>
                  <h2 className="mb-6 font-headline text-2xl font-black italic text-charcoal-brand">Need a Transfer?</h2>
                  <TransferSection transferAddons={transferAddons} transfer={transfer} onTransferChange={setTransfer} errors={transferErrors} />
                </section>
              </FadeUpSection>
            )}

            <PawDivider size="sm" />

            <FadeUpSection>
              <section>
                <h2 className="mb-6 font-headline text-2xl font-black italic text-charcoal-brand">Renter Details</h2>
                <RenterDetailsForm info={renter} onChange={setRenter} errors={formErrors} />
              </section>
            </FadeUpSection>
          </div>

          <div className="lg:col-span-5">
            <OrderSummaryPanel
              basket={basket} rentalDays={rentalDays} selectedAddonIds={selectedAddonIds} addons={standardAddons}
              transfer={transfer} transferAddons={transferAddons} pickupFee={pickupFee} dropoffFee={dropoffFee}
              paymentMethod={paymentMethod} onPaymentChange={setPaymentMethod} onPlaceOrder={handlePlaceOrder} submitting={submitting}
            />
          </div>
        </div>
      </div>

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
