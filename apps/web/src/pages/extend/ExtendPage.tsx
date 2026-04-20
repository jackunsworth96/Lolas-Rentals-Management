import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

import lolaVideo from '../../assets/Checkout_Lola.mp4';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';
import { formatCurrency } from '../../utils/currency.js';

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
  // Parse YYYY-MM-DD as local midnight to avoid UTC shift in Manila (UTC+8)
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

  const handleLookup = useCallback(async (email: string, orderReference: string) => {
    setLookupLoading(true); setLookupError(null); setLookupEmail(email);
    try {
      const res = await api.post<{ found: boolean; order?: OrderData }>('/public/extend/lookup', { email, orderReference });
      if (res.found && res.order) { setOrder(res.order); setPageState('rental'); }
      else setLookupError("We couldn't find that booking. Double-check your reference or contact us on WhatsApp for help.");
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_ACTIVE') {
        setLookupError(ORDER_NOT_ACTIVE_CUSTOMER_MESSAGE);
      } else {
        setLookupError("Something went wrong. Please try again or contact us on WhatsApp for help.");
      }
    }
    finally { setLookupLoading(false); }
  }, []);

  // Call the same /public/extend/preview endpoint used by the backoffice, so
  // the customer sees the *capped* extension cost (never higher than the
  // original daily rate) — not the raw bracket rate from /public/booking/quote.
  useEffect(() => {
    if (!order || !selectedDate || !lookupEmail) { setExtensionCost(null); return; }
    const newDropoff = `${selectedDate}T${selectedTime}:00`;
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
  }, [order, selectedDate, selectedTime, lookupEmail]);

  // Use Math.round to match server logic (extDayCount in public-extend-helpers.ts)
  const extensionDays = selectedDate && order
    ? Math.max(1, Math.round((new Date(selectedDate).getTime() - new Date(order.currentDropoffDatetime).getTime()) / 86400000))
    : 0;

  async function handleConfirm() {
    if (!order || !selectedDate) return;
    setConfirmLoading(true);
    const newDropoff = `${selectedDate}T${selectedTime}:00`;
    try {
      const res = await api.post<{ success: boolean; newDropoffDatetime?: string; extensionCost?: number; reason?: string }>(
        '/public/extend/confirm',
        { orderReference: order.orderReference, email: lookupEmail, newDropoffDatetime: newDropoff },
      );
      if (res.success) {
        setConfirmedDropoff(res.newDropoffDatetime ?? newDropoff);
        setConfirmedBalance(res.extensionCost ?? extensionCost ?? 0);
        setPageState('confirmed');
      } else {
        setLookupError(res.reason ?? 'Extension failed. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_ACTIVE') {
        setLookupError(ORDER_NOT_ACTIVE_CUSTOMER_MESSAGE);
      } else {
        setLookupError('Something went wrong. Please try again.');
      }
    } finally { setConfirmLoading(false); }
  }

  function handleReset() {
    setPageState('lookup'); setOrder(null); setSelectedDate(null);
    setExtensionCost(null); setLookupError(null);
  }

  return (
    <PageLayout title="Extend My Rental | Lola's Rentals" fullBleed>
      <SEO
        title="Extend Your Rental | Lola's Rentals"
        description="Extend your Lola's Rentals scooter or motorbike rental on Siargao."
        noIndex={true}
      />
      {/* Page header — shown in full on mobile; shorter on desktop when content is already visible */}
      <PageHeader
        eyebrow="Need More Time?"
        headingMain="Extend Your"
        headingAccent="Rental"
        subheading="Loving Siargao? We get it. Extend your rental in just a few clicks."
        fitAboveFold
        className="px-4 pb-3 pt-8 text-center sm:px-6 sm:pb-6 sm:pt-16 lg:pb-8 lg:pt-14"
      />

      {/* Main content — narrow on mobile, widens on desktop */}
      <div className="relative mx-auto max-w-lg px-4 pb-12 pt-2 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-8">

        {pageState === 'confirmed' ? (
          <div className="mx-auto max-w-xl">
            <ConfirmedView dropoff={confirmedDropoff} balance={confirmedBalance} />
          </div>
        ) : (
          <>
            {pageState === 'lookup' && (
              <FadeUpSection>
                {/* Centred, reasonably constrained on all screen sizes */}
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
                      Welcome, {firstNameOf(order.customerName)}!
                    </p>
                  </FadeUpSection>
                )}

                {/*
                  Mobile  → stacked vertically
                  Desktop → fixed-width vehicle sidebar (left) + fluid calendar/summary (right)
                */}
                <div className="lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-10">

                  {/* ── Left column: vehicle card, sticky on desktop ── */}
                  <div className="lg:sticky lg:top-24">
                    <FadeUpSection>
                      <ActiveRentalCard
                        vehicleModelName={order.vehicleModelName}
                        pickupLocationName={order.pickupLocationName}
                        currentDropoffDatetime={order.currentDropoffDatetime}
                      />
                    </FadeUpSection>
                  </div>

                  {/* ── Right column: calendar + summary ── */}
                  <div className="mt-6 space-y-6 lg:mt-0">
                    <FadeUpSection>
                      <ExtendCalendar
                        currentDropoff={order.currentDropoffDatetime}
                        selectedDate={selectedDate}
                        selectedTime={selectedTime}
                        onSelectDate={setSelectedDate}
                        onSelectTime={setSelectedTime}
                      />
                    </FadeUpSection>

                    {selectedDate && (
                      <FadeUpSection>
                        <ExtensionSummary
                          originalTotal={order.originalTotal}
                          extensionCost={extensionCost}
                          extensionDays={extensionDays}
                          originalDays={order.rentalDays}
                          newReturnDisplay={formatNewReturn(selectedDate, selectedTime)}
                          loading={confirmLoading || quoteLoading}
                          onConfirm={handleConfirm}
                          onCancel={handleReset}
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
                      WhatsApp us
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

function ConfirmedView({ dropoff, balance }: { dropoff: string; balance: number }) {
  // dropoff is a naive local datetime string (e.g. "2026-04-21T16:45:00") — no UTC conversion needed
  const d = new Date(dropoff);
  const dateFormatted = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeFormatted = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <FadeUpSection>
      <div className="space-y-8 text-center">
        <div className="flex justify-center">
          <div className="relative pb-2">
            <div
              className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full animate-extend-lola-gentle"
            >
              <video
                src={lolaVideo}
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
          </div>
        </div>
        <style>{`
          @keyframes extendLolaGentle {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          .animate-extend-lola-gentle {
            animation: extendLolaGentle 4s ease-in-out infinite;
          }
        `}</style>
        <p className="font-lato mx-auto max-w-xl text-base font-semibold leading-relaxed text-charcoal-brand md:text-lg">
          Extension confirmed! Your new return date/time has been updated. Please come by our store to settle the outstanding balance within the next 24hrs during our opening hours of 9AM - 5PM.
        </p>
        <div className="rounded-4xl bg-cream-brand p-8 shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
          <p className="font-lato text-[10px] font-black uppercase tracking-widest text-teal-brand/60">New Return Date &amp; Time</p>
          <p className="font-lato mt-2 text-2xl font-black text-teal-brand">{dateFormatted}</p>
          <p className="font-lato mt-1 text-lg font-bold text-teal-brand/70">{timeFormatted}</p>
          {balance > 0 && (
            <div className="mt-6 border-t-2 border-sand-brand pt-6">
              <p className="font-lato text-[10px] font-black uppercase tracking-widest text-gold-brand/60">Extension Cost</p>
              <p className="font-lato mt-1 text-3xl font-black text-gold-brand">{formatCurrency(balance)}</p>
              <p className="font-lato mt-2 text-xs font-semibold text-charcoal-brand/60">
                Added to any outstanding balance on your booking.
              </p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Link to="/book/reserve">
            <PrimaryCtaButton className="flex min-h-[44px] w-full items-center justify-center gap-2 py-5 text-lg">Back to Browse</PrimaryCtaButton>
          </Link>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-lato inline-flex items-center justify-center gap-2 text-sm font-bold text-teal-brand underline transition-opacity hover:opacity-80"
          >
            <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
            Need help? Chat with Lola&apos;s Team
          </a>
        </div>
      </div>
    </FadeUpSection>
  );
}
