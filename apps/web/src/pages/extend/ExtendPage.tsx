import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { PawDivider } from '../../components/layout/PawDivider.js';
import { PageHeader } from '../../components/public/PageHeader.js';
import { BookingLookupForm } from '../../components/extend/BookingLookupForm.js';
import { ActiveRentalCard } from '../../components/extend/ActiveRentalCard.js';
import { ExtendCalendar } from '../../components/extend/ExtendCalendar.js';
import { ExtensionSummary } from '../../components/extend/ExtensionSummary.js';
import { ExtendAddOnsSection } from '../../components/extend/ExtendAddOnsSection.js';
import { ExtendLocationPicker } from '../../components/extend/ExtendLocationPicker.js';
import { useCustomerPawCardSavings } from '../../api/paw-card.js';
import { isNinePmReturnAddonName } from '../../components/basket/AddOnsSection.js';
import { formatCurrency } from '../../utils/currency.js';
import iconPawCard from '../../assets/Home/Paw Card Icon.svg';

import lolaVideo from '../../assets/Checkout_Lola.mp4';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';

interface CurrentOrderAddon {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
}

interface AvailableLocation {
  id: number;
  name: string;
  deliveryCost: number;
  collectionCost: number;
  locationType: string | null;
}

interface OrderData {
  orderReference: string;
  customerName?: string | null;
  vehicleModelName: string;
  vehicleModelId: string;
  storeId: string;
  currentDropoffDatetime: string;
  pickupLocationName: string;
  originalTotal: number;
  rentalDays: number;
  currentOrderAddons: CurrentOrderAddon[];
  currentDropoffLocationId: number | null;
  currentDropoffFee: number;
  availableLocations: AvailableLocation[];
}

function firstNameOf(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

type PageState = 'lookup' | 'rental' | 'confirmed';

const DEFAULT_TIME = '16:45';

const ORDER_NOT_ACTIVE_CUSTOMER_MESSAGE =
  "Your booking hasn't been activated yet — extensions are only available once your rental has started. Please contact us if you need to make changes to your booking.";

function formatNewReturn(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const [h, min] = time.split(':').map(Number);
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const timeLabel = `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
  return `${dateLabel} at ${timeLabel}`;
}

export default function ExtendPage() {
  const { t } = useTranslation();
  const [pageState, setPageState] = useState<PageState>('lookup');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState(DEFAULT_TIME);
  const [extensionCost, setExtensionCost] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmedDropoff, setConfirmedDropoff] = useState('');
  const [confirmedBalance, setConfirmedBalance] = useState(0);
  const [lookupEmail, setLookupEmail] = useState('');
  const [ninePmSelected, setNinePmSelected] = useState(false);

  // New state for add-ons and location
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState('');

  // Fetch addon catalog once we know the store (for the add-ons section toggle)
  const { data: addonsRaw } = useQuery<Array<{ id: number; name: string; addon_type: string; price_one_time: number }>>({
    queryKey: ['public-extend-addons', order?.storeId ?? ''],
    queryFn: () => api.get(`/public/extend/addons?storeId=${encodeURIComponent(order!.storeId)}`),
    enabled: !!order?.storeId,
    retry: false,
    throwOnError: false,
  });

  // Identify the 9PM addon from catalog (still kept for ExtendCalendar compatibility)
  const ninePmAddonRaw = addonsRaw?.find((a) => isNinePmReturnAddonName(a.name)) ?? null;
  const ninePmAddon = ninePmAddonRaw
    ? { id: ninePmAddonRaw.id, name: ninePmAddonRaw.name, price: ninePmAddonRaw.price_one_time }
    : null;

  const { data: pawCardData } = useCustomerPawCardSavings(lookupEmail || undefined);

  const handleSelectTime = useCallback((time: string) => {
    setSelectedTime(time);
    if (time !== '16:45') setNinePmSelected(false);
  }, []);

  const handleToggleAddon = useCallback((id: number) => {
    // If it's the 9PM addon, route through ninePmSelected for backward compat
    if (ninePmAddon && id === ninePmAddon.id) {
      setNinePmSelected((v) => !v);
      return;
    }
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, [ninePmAddon]);

  const handleLookup = useCallback(async (email: string, orderReference: string) => {
    setLookupLoading(true); setLookupError(null); setLookupEmail(email);
    try {
      const res = await api.post<{ found: boolean; order?: OrderData }>('/public/extend/lookup', { email, orderReference });
      if (res.found && res.order) {
        setOrder(res.order);
        setSelectedLocationId(null);
        setLocationAddress('');
        setSelectedAddonIds([]);
        setNinePmSelected(false);
        setPageState('rental');
      } else {
        setLookupError(t('extend.lookupNotFound'));
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_ACTIVE') {
        setLookupError(t('extend.notActiveError'));
      } else {
        setLookupError(t('extend.lookupError'));
      }
    } finally { setLookupLoading(false); }
  }, [t]);

  const effectiveTime = ninePmSelected ? '21:00' : selectedTime;

  useEffect(() => {
    if (!order || !selectedDate || !lookupEmail) { setExtensionCost(null); return; }
    const newDropoff = `${selectedDate}T${effectiveTime}:00+08:00`;
    let cancelled = false;
    setQuoteLoading(true);
    setExtensionCost(null);
    (async () => {
      try {
        const params = new URLSearchParams({
          orderReference: order.orderReference,
          email: lookupEmail,
          newDropoffDatetime: newDropoff,
        });
        const q = await api.get<{ extensionTotal: number; dailyRate: number; extensionDays: number; bracketLabel: string }>(
          `/public/extend/preview?${params.toString()}`,
        );
        if (!cancelled) setExtensionCost(q.extensionTotal);
      } catch {
        if (!cancelled) setExtensionCost(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order, selectedDate, effectiveTime, lookupEmail]);

  const extensionDays = selectedDate && order
    ? Math.max(1, Math.ceil(
        (new Date(`${selectedDate}T${effectiveTime}:00+08:00`).getTime() - new Date(order.currentDropoffDatetime).getTime()) / 86400000
      ))
    : 0;

  // Compute per-day addon delta client-side.
  // Derive the actual per-day rate from total_amount / originalRentalDays to handle
  // bookings where quantity stores rental days rather than a unit count.
  const perDayAddonDelta = order
    ? order.currentOrderAddons
        .filter((a) => a.addonType === 'per_day')
        .reduce((sum, a) => {
          const perDayRate = order.rentalDays > 0 ? a.totalAmount / order.rentalDays : a.addonPrice;
          return sum + Math.round(perDayRate * extensionDays * 100) / 100;
        }, 0)
    : 0;

  // New add-on lines for summary (excluding 9PM which is handled separately)
  const newAddonLines = (addonsRaw ?? [])
    .filter((ca) => selectedAddonIds.includes(ca.id) && ca.id !== (ninePmAddon?.id ?? -1))
    .map((ca) => ({ name: ca.name, cost: Number(ca.price_one_time ?? 0) }));

  // Location delta
  const currentDropoffFee = order?.currentDropoffFee ?? 0;
  const selectedLocData = order?.availableLocations.find((l) => l.id === selectedLocationId);
  const locationDelta = selectedLocData != null
    ? Math.round((Number(selectedLocData.collectionCost) - currentDropoffFee) * 100) / 100
    : 0;
  const newLocationName = selectedLocData?.name;

  // Effective return location name for the card (selected > current > fallback)
  const currentDropoffLocName = order?.availableLocations.find((l) => l.id === order.currentDropoffLocationId)?.name;
  const effectiveReturnLocationName = selectedLocData?.name ?? currentDropoffLocName ?? order?.pickupLocationName ?? '';

  async function handleConfirm() {
    if (!order || !selectedDate) return;
    setConfirmLoading(true);
    const newDropoff = `${selectedDate}T${effectiveTime}:00+08:00`;
    try {
      const body: Record<string, unknown> = {
        orderReference: order.orderReference,
        email: lookupEmail,
        newDropoffDatetime: newDropoff,
      };
      if (ninePmSelected && ninePmAddon) body.ninePmAddonId = ninePmAddon.id;
      if (selectedAddonIds.length > 0) body.newOneTimeAddonIds = selectedAddonIds.filter((id) => id !== (ninePmAddon?.id ?? -1));
      if (selectedLocationId != null && selectedLocationId !== order.currentDropoffLocationId) {
        body.newDropoffLocationId = selectedLocationId;
        if (locationAddress.trim()) body.newDropoffLocationAddress = locationAddress.trim();
      }
      const res = await api.post<{ success: boolean; newDropoffDatetime?: string; extensionCost?: number; reason?: string }>(
        '/public/extend/confirm',
        body,
      );
      if (res.success) {
        setConfirmedDropoff(res.newDropoffDatetime ?? newDropoff);
        setConfirmedBalance(res.extensionCost ?? (extensionCost ?? 0) + (ninePmSelected && ninePmAddon ? ninePmAddon.price : 0) + perDayAddonDelta + newAddonLines.reduce((s, a) => s + a.cost, 0) + locationDelta);
        setPageState('confirmed');
      } else {
        setLookupError(res.reason ?? t('extend.extensionFailed'));
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_ACTIVE') {
        setLookupError(t('extend.notActiveError'));
      } else {
        setLookupError(t('extend.somethingWrong'));
      }
    } finally { setConfirmLoading(false); }
  }

  function handleReset() {
    setPageState('lookup'); setOrder(null); setSelectedDate(null);
    setExtensionCost(null); setLookupError(null); setNinePmSelected(false);
    setSelectedAddonIds([]); setSelectedLocationId(null); setLocationAddress('');
  }

  return (
    <PageLayout title={t('extend.pageTitle')} fullBleed>
      <SEO
        title={t('extend.seoTitle')}
        description={t('extend.seoDescription')}
        noIndex={true}
      />
      {pageState !== 'confirmed' && (
        <PageHeader
          eyebrow={t('extend.eyebrow')}
          headingMain={t('extend.headingMain')}
          headingAccent={t('extend.headingAccent')}
          subheading={t('extend.subheading')}
          fitAboveFold
          className="px-4 pb-3 pt-8 text-center sm:px-6 sm:pb-6 sm:pt-16 lg:pb-8 lg:pt-14"
        />
      )}

      <div className="relative mx-auto max-w-lg px-4 pb-12 pt-2 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-8">

        {pageState === 'confirmed' ? (
          <div className="mx-auto max-w-md">
            <ConfirmedView dropoff={confirmedDropoff} balance={confirmedBalance} orderRef={order?.orderReference ?? ''} />
          </div>
        ) : (
          <>
            {pageState === 'lookup' && (
              <FadeUpSection>
                <div className="mx-auto max-w-lg">
                  <BookingLookupForm loading={lookupLoading} onSubmit={handleLookup} error={lookupError} onFound={() => {}} onNotFound={() => {}} />
                </div>
              </FadeUpSection>
            )}

            {pageState === 'rental' && order && (
              <>
                <PawDivider size="sm" opacity={0.1} />

                {firstNameOf(order.customerName) && (
                  <FadeUpSection>
                    <p className="mb-6 font-headline text-2xl font-black text-charcoal-brand sm:text-3xl lg:mb-8 lg:text-4xl">
                      {t('extend.welcome', { name: firstNameOf(order.customerName) })}
                    </p>
                  </FadeUpSection>
                )}

                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-10">

                  {/* ── Left column: vehicle card + Paw Card, sticky on desktop ── */}
                  <div className="space-y-4 lg:sticky lg:top-24">
                    <FadeUpSection>
                      <ActiveRentalCard
                        vehicleModelName={order.vehicleModelName}
                        returnLocationName={effectiveReturnLocationName}
                        currentDropoffDatetime={order.currentDropoffDatetime}
                      />
                    </FadeUpSection>
                    <FadeUpSection>
                      <PawCardWidget savings={pawCardData} />
                    </FadeUpSection>
                  </div>

                  {/* ── Right column: calendar, add-ons, location, summary ── */}
                  <div className="mt-6 space-y-6 lg:mt-0">
                    <FadeUpSection>
                      <ExtendCalendar
                        currentDropoff={order.currentDropoffDatetime}
                        selectedDate={selectedDate}
                        selectedTime={selectedTime}
                        onSelectDate={setSelectedDate}
                        onSelectTime={handleSelectTime}
                        ninePmSelected={ninePmSelected}
                      />
                    </FadeUpSection>

                    {/* Add-ons section (shown once a date is selected so extension days are known) */}
                    {selectedDate && (addonsRaw ?? []).length > 0 && (
                      <FadeUpSection>
                        <ExtendAddOnsSection
                          currentOrderAddons={order.currentOrderAddons}
                          catalogAddons={addonsRaw ?? []}
                          selectedAddonIds={selectedAddonIds}
                          ninePmSelected={ninePmSelected}
                          extensionDays={extensionDays}
                          originalRentalDays={order.rentalDays}
                          selectedTime={selectedTime}
                          onToggleAddon={handleToggleAddon}
                        />
                      </FadeUpSection>
                    )}

                    {/* Location picker */}
                    {order.availableLocations.length > 1 && (
                      <FadeUpSection>
                        <ExtendLocationPicker
                          availableLocations={order.availableLocations}
                          currentDropoffLocationId={order.currentDropoffLocationId}
                          currentDropoffFee={order.currentDropoffFee}
                          selectedLocationId={selectedLocationId}
                          locationAddress={locationAddress}
                          onSelectLocation={setSelectedLocationId}
                          onChangeAddress={setLocationAddress}
                        />
                      </FadeUpSection>
                    )}

                    {selectedDate && (
                      <FadeUpSection>
                        <ExtensionSummary
                          originalTotal={order.originalTotal}
                          extensionCost={extensionCost}
                          extensionDays={extensionDays}
                          originalDays={order.rentalDays}
                          newReturnDisplay={formatNewReturn(selectedDate, effectiveTime)}
                          loading={confirmLoading || quoteLoading}
                          onConfirm={handleConfirm}
                          onCancel={handleReset}
                          ninePmCost={ninePmSelected && ninePmAddon ? ninePmAddon.price : undefined}
                          perDayAddonDelta={perDayAddonDelta > 0 ? perDayAddonDelta : undefined}
                          newAddons={newAddonLines.length > 0 ? newAddonLines : undefined}
                          locationDelta={locationDelta !== 0 ? locationDelta : undefined}
                          newLocationName={newLocationName}
                        />
                      </FadeUpSection>
                    )}
                  </div>
                </div>

                {lookupError && (
                  <div
                    className={
                      lookupError === ORDER_NOT_ACTIVE_CUSTOMER_MESSAGE
                        ? 'mt-6 rounded-2xl bg-sand-brand px-3 py-2 text-xs font-bold text-charcoal-brand/70 sm:px-4 sm:py-3 sm:text-sm'
                        : 'mt-6 rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700'
                    }
                  >
                    {lookupError}{' '}
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        lookupError === ORDER_NOT_ACTIVE_CUSTOMER_MESSAGE
                          ? 'inline-flex items-center gap-1 font-black text-teal-brand underline'
                          : 'inline-flex items-center gap-1 text-teal-brand underline'
                      }
                    >
                      <img src={phoneIcon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" width={14} height={14} />
                      {t('extend.whatsappUs')}
                    </a>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

function PawCardWidget({ savings }: { savings?: { hasPawCard: boolean; totalSaved: number; entryCount: number } }) {
  const { t } = useTranslation();
  const hasSaved = savings?.hasPawCard && (savings.totalSaved ?? 0) > 0;

  if (hasSaved) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-teal-brand/15 bg-sand-brand/50 px-4 py-4">
        <img src={iconPawCard} alt="Paw Card" className="mt-0.5 h-8 w-8 shrink-0 object-contain" />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-teal-brand">{t('extend.pawCardSavings')}</p>
          <p className="mt-0.5 text-2xl font-black text-teal-brand">{formatCurrency(savings!.totalSaved)}</p>
          <p className="mt-0.5 text-xs font-semibold text-charcoal-brand/60">
            {t(savings!.entryCount === 1 ? 'extend.savedAcross' : 'extend.savedAcross_other', { count: savings!.entryCount })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-teal-brand/15 bg-sand-brand/50 px-4 py-4">
      <img src={iconPawCard} alt="Paw Card" className="mt-0.5 h-8 w-8 shrink-0 object-contain" />
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-teal-brand">{t('extend.pawCard')}</p>
        <p className="mt-0.5 text-sm font-bold text-charcoal-brand">{t('extend.startSaving')}</p>
        <p className="mt-0.5 text-xs font-semibold text-charcoal-brand/60">
          {t('extend.askAboutPawCard')}
        </p>
      </div>
    </div>
  );
}

function ConfirmedView({ dropoff, balance, orderRef }: { dropoff: string; balance: number; orderRef: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const d = new Date(dropoff);
  const dateFormatted = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeFormatted = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const pad = (n: number) => String(n).padStart(2, '0');
  const gcalStamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Return to Lola's Rentals")}&dates=${gcalStamp}/${gcalStamp}&details=${encodeURIComponent(`Return your vehicle to Lola's Rentals. Ref: ${orderRef}`)}&location=${encodeURIComponent("Lola's Rentals, Siargao")}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(orderRef);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <FadeUpSection>
      <div className="mx-auto max-w-sm space-y-5 pb-8">

        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-brand/30 bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-brand">
            {t('extend.confirmed')}
          </span>
          <h1 className="font-headline text-4xl font-black text-charcoal-brand">{t('extend.allSet')}</h1>
          <p className="text-sm text-charcoal-brand/60">{t('extend.returnUpdated')}</p>
        </div>

        <div className="flex justify-center">
          <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-gold-brand/50 bg-gold-brand/20">
            <video
              src={lolaVideo}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {balance > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm text-white">
                🔔
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-red-700">{t('extend.actionRequired')}</p>
                <p className="mt-1 text-xs leading-relaxed text-red-600">
                  {t('extend.settleBalance', { amount: formatCurrency(balance) })}
                </p>
              </div>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-green-600"
            >
              <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
              {t('extend.messageTeam')}
            </a>
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-brand/40">{t('extend.newReturnDate')}</p>
          <p className="mt-1.5 text-2xl font-black text-charcoal-brand">{dateFormatted}</p>
          <p className="mt-0.5 text-lg font-black text-gold-brand">{timeFormatted}</p>
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-charcoal-brand/70 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            {t('extend.addToCalendar')}
          </a>

          <div className="my-4 border-t border-gray-100" />

          <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-brand/40">{t('extend.extensionCost')}</p>
          <p className="mt-1.5 text-3xl font-black text-charcoal-brand">{formatCurrency(balance)}</p>
          <p className="mt-1 text-xs text-charcoal-brand/50">{t('extend.addedToBalance')}</p>

          {orderRef && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-sand-brand/60 px-4 py-2.5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-charcoal-brand/40">{t('extend.extensionRef')}</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-charcoal-brand">{orderRef}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal-brand transition-colors hover:bg-gray-50"
              >
                {copied ? t('extend.copiedRef') : t('extend.copyRef')}
              </button>
            </div>
          )}
        </div>

        <Link to="/book/reserve" className="block">
          <PrimaryCtaButton className="flex min-h-[52px] w-full items-center justify-center gap-2 py-4 text-base">
            {t('extend.backToBrowse')}
          </PrimaryCtaButton>
        </Link>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm font-semibold text-charcoal-brand/60 transition-colors hover:text-teal-brand"
        >
          <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          {t('extend.needHelp')}
        </a>

      </div>
    </FadeUpSection>
  );
}
