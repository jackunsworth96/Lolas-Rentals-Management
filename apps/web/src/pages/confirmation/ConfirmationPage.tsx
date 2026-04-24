import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Clipboard, FileSignature, CalendarPlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { RentalSummaryCard } from '../../components/confirmation/RentalSummaryCard.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';
import LolasChat from '../../components/chat/LolasChat.js';

import lolaVideo from '../../assets/Checkout_Lola.mp4';
import { WHATSAPP_NUMBER, WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon, locationIcon } from '../../components/public/customerContactIcons.js';

interface ConfirmationState {
  orderReferences: string[];
  customerName: string;
  customerEmail: string;
  vehicleModelName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupLocationId?: number | null;
  rentalDays: number;
  grandTotal: number;
  depositAmount: number;
  addonNames: string[];
  transferType?: 'shared' | 'private' | 'tuktuk' | null;
  flightNumber?: string | null;
  transferRoute?: string | null;
  transferPrice?: number;
  charityDonation?: number;
}

function makeGoogleCalendarUrl(title: string, start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent('Tourism Rd, Catangnan, General Luna, Siargao')}`;
}

export default function ConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reference } = useParams<{ reference?: string }>();
  const clearBasket = useBookingStore((s) => s.clearBasket);

  const basketHadTukRef = useRef<boolean | null>(null);
  if (basketHadTukRef.current === null) {
    basketHadTukRef.current = useBookingStore.getState().basket.some((b) =>
      b.modelName.toLowerCase().includes('tuk'),
    );
  }

  const navState = location.state as ConfirmationState | null;
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get('payment') as 'success' | 'failed' | 'cancelled' | null;

  const [state, setState] = useState<ConfirmationState | null>(navState);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { clearBasket(); }, [clearBasket]);

  useEffect(() => {
    if (state) return;
    if (!reference) { setFetchError(true); return; }

    const storedState = sessionStorage.getItem(`confirm_state_${reference}`);
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState) as ConfirmationState;
        setState(parsed);
        return;
      } catch { /* ignore */ }
    }

    const savedEmail = sessionStorage.getItem(`confirm_email_${reference}`) ?? '';
    if (!savedEmail) { setFetchError(true); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api.get<ConfirmationState>(
      `/public/booking/order/${encodeURIComponent(reference)}?email=${encodeURIComponent(savedEmail)}`
    )
      .then((data) => { if (!cancelled) setState(data); })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state, reference]);

  if (loading) {
    return (
      <PageLayout title="Loading... | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
        </div>
      </PageLayout>
    );
  }

  if (fetchError || (!state && !reference)) {
    return (
      <PageLayout title="Booking Not Found | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <h2 className="mb-4 font-headline text-3xl font-black text-charcoal-brand">Booking not found</h2>
          <p className="mb-8 text-charcoal-brand/60">We could not find a booking with that reference.</p>
          <PrimaryCtaButton type="button" onClick={() => navigate('/book/reserve')} className="px-10 py-4 font-bold">
            Browse Vehicles
          </PrimaryCtaButton>
        </div>
      </PageLayout>
    );
  }

  if (!state) return null;

  const refDisplay = state.orderReferences.join(' · ');
  const calendarUrl = state.pickupDatetime && state.dropoffDatetime
    ? makeGoogleCalendarUrl(`Lola's Rentals — ${state.vehicleModelName}`, state.pickupDatetime, state.dropoffDatetime)
    : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(refDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi Lola's! My booking ref is ${refDisplay}`)}`;

  return (
    <PageLayout title="Booking Confirmed | Lola's Rentals" showFloralRight={false}>
      <SEO
        title="Booking Confirmed | Lola's Rentals"
        description="Your Lola's Rentals booking is confirmed."
        noIndex={true}
      />

      <div
        className="relative -mx-4 -mt-20 min-h-screen overflow-hidden px-4 pt-20"
        style={{ backgroundColor: '#f1e6d6' }}
      >
        <HeroFloatingClouds variant="editorial" />

        <div className="relative z-10 mx-auto max-w-5xl pt-6">

          {/* ── Payment status banners ── */}
          {paymentStatus === 'success' && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 flex items-center gap-3">
              <svg className="h-6 w-6 shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="font-semibold text-green-800 font-lato">Payment received!</p>
                <p className="text-sm text-green-700 font-lato">Your card payment was successful. Your booking is confirmed.</p>
              </div>
            </div>
          )}
          {(paymentStatus === 'failed' || paymentStatus === 'cancelled') && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3">
              <svg className="h-6 w-6 shrink-0 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <div>
                <p className="font-semibold text-red-800 font-lato">Payment {paymentStatus === 'cancelled' ? 'cancelled' : 'failed'}</p>
                <p className="text-sm text-red-700 font-lato">
                  Your booking is still confirmed but payment was not completed.{' '}
                  <a href={WHATSAPP_URL} className="underline font-medium">Contact us on WhatsApp</a> to arrange payment.
                </p>
              </div>
            </div>
          )}

          {/* ── HERO ── */}
          <FadeUpSection>
            <div className="mb-10 flex flex-col items-center text-center">
              {/* Green checkmark circle */}
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-200">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              {/* Confirmed pill */}
              <div
                className="mb-5 inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  backgroundColor: '#FCBC5A',
                  color: '#363737',
                  border: '2px solid #363737',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  boxShadow: '3px 3px 0 #363737',
                  padding: '7px 18px',
                }}
              >
                <span>✓</span>
                <span className="font-lato uppercase tracking-widest">Booking Confirmed</span>
              </div>

              {/* Headline */}
              <h1 className="mb-2 font-headline text-5xl font-black leading-tight tracking-tight text-teal-brand sm:text-6xl">
                See you in Siargao.
              </h1>
              <p className="mb-6 text-charcoal-brand/60 font-lato">
                Your scooter is reserved and ready for you.
              </p>

              {/* Reference number */}
              <div className="mb-4 flex flex-col items-center">
                <span className="mb-2 text-[10px] font-black uppercase tracking-widest text-charcoal-brand/50 font-lato">
                  Your Reference Number
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="font-lato font-black"
                    style={{
                      fontSize: 'clamp(24px, 6vw, 34px)',
                      letterSpacing: '0.15em',
                      color: '#363737',
                      borderBottom: '4px solid #FCBC5A',
                      paddingBottom: '4px',
                    }}
                  >
                    {refDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-charcoal-brand/60 transition-all hover:bg-white active:scale-90"
                    title="Copy reference"
                  >
                    {copied ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Clipboard className="h-4 w-4" strokeWidth={2} />}
                    {copied && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-teal-brand px-3 py-1 text-[10px] font-bold text-white shadow-md">
                        Copied!
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Receipt sent */}
              <p className="flex items-center gap-1.5 text-sm font-bold text-charcoal-brand/50 font-lato">
                <Check className="h-4 w-4 text-teal-brand" strokeWidth={2.5} />
                Receipt sent to <span className="text-charcoal-brand">{state.customerEmail}</span>
              </p>

              {/* Scroll prompt — nudges users toward the waiver section below */}
              <motion.button
                type="button"
                onClick={() => window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' })}
                aria-label="Scroll down to complete your waiver"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 32,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#00577C',
                  opacity: 0.7,
                  padding: 0,
                }}
              >
                <span className="font-lato" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Complete your waiver below
                </span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </motion.button>
            </div>
          </FadeUpSection>

          {/* ── TWO-COLUMN GRID ── */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-stretch">

            {/* LEFT — Quick Actions + Lola card */}
            <div className="flex flex-col gap-4 h-full">
              <FadeUpSection>
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="mb-4 text-xs font-black uppercase tracking-widest text-charcoal-brand/50 font-lato">
                    Quick Actions
                  </p>

                  {/* Deposit reminder */}
                  {(state.depositAmount ?? 0) > 0 && (
                    <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                      <span className="text-lg">💰</span>
                      <p className="text-xs font-semibold leading-relaxed text-amber-800 font-lato">
                        A refundable security deposit is required at pickup — ₱1,000 for scooters, ₱2,000 for tuktuks.
                      </p>
                    </div>
                  )}

                  {/* Waiver CTA */}
                  {state.orderReferences?.[0] && (
                    <>
                      <Link
                        to={`/waiver/${state.orderReferences[0]}`}
                        className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-brand py-3 px-5 font-lato text-sm font-black text-charcoal-brand shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
                      >
                        <FileSignature size={16} className="shrink-0" />
                        Complete Your Waiver
                      </Link>
                      <p className="mb-4 text-center text-[11px] text-charcoal-brand/50 font-lato">
                        Takes 2 minutes · saves time at pickup
                      </p>
                    </>
                  )}

                  {/* WhatsApp */}
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 px-5 font-lato text-sm font-black text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98]"
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden className="shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Send Booking Ref via WhatsApp
                  </a>

                  {/* Add to Calendar */}
                  {calendarUrl && (
                    <a
                      href={calendarUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-charcoal-brand/15 bg-white py-3 px-5 font-lato text-sm font-black text-charcoal-brand transition-all hover:border-teal-brand/30 hover:bg-teal-brand/5 active:scale-[0.98]"
                    >
                      <CalendarPlus size={16} className="shrink-0" />
                      Add to Calendar
                    </a>
                  )}
                </div>
              </FadeUpSection>

              {/* Lola team card — stretches to fill remaining height */}
              <FadeUpSection className="flex flex-1 flex-col">
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-gold-brand/15 px-6 py-8 text-center">
                  <div className="h-[12.096rem] w-[12.096rem] overflow-hidden rounded-full border-4 border-gold-brand/50 bg-gold-brand/20 shadow-md">
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
                  <div>
                    <p className="font-headline text-base font-black text-charcoal-brand">The Lola team is ready!</p>
                    <p className="mt-1 text-sm text-charcoal-brand/60 font-lato leading-snug">
                      We'll have your scooter fuelled, helmeted, and waiting.
                    </p>
                  </div>
                </div>
              </FadeUpSection>

              {/* Charity */}
              {(state.charityDonation ?? 0) > 0 && (
                <FadeUpSection>
                  <div className="rounded-2xl bg-teal-brand/10 px-5 py-4 text-center">
                    <p className="font-headline text-base font-bold text-teal-brand">
                      Thank you for your ₱{(state.charityDonation ?? 0).toLocaleString()} donation to Be Pawsitive 🐾
                    </p>
                    <p className="font-lato mt-1 text-sm text-charcoal-brand/60">
                      You're helping animals on Siargao!
                    </p>
                  </div>
                </FadeUpSection>
              )}
            </div>

            {/* RIGHT — Rental Summary */}
            <FadeUpSection className="flex flex-col h-full">
              <RentalSummaryCard
                vehicleModelName={state.vehicleModelName}
                pickupDatetime={state.pickupDatetime}
                dropoffDatetime={state.dropoffDatetime}
                rentalDays={state.rentalDays}
                grandTotal={state.grandTotal}
                customerEmail={state.customerEmail}
                addonNames={state.addonNames ?? []}
                transferType={state.transferType}
                flightNumber={state.flightNumber}
                transferRoute={state.transferRoute}
                transferPrice={state.transferPrice}
                charityDonation={state.charityDonation}
                calendarUrl={calendarUrl}
              />
            </FadeUpSection>
          </div>

          {/* ── WHAT TO DO NEXT ── */}
          <FadeUpSection>
            <div className="mt-10">
              <h2 className="mb-5 flex items-center gap-2 font-headline text-2xl font-black text-charcoal-brand">
                <span className="text-xl">⏱</span> What to do next
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

                {/* 1 — Waiver */}
                <div className="relative rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-brand text-xs font-black text-white">1</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600">Do Now</span>
                  </div>
                  <span className="mb-2 block text-2xl">📋</span>
                  <p className="mb-1 font-headline text-sm font-black text-charcoal-brand leading-tight">Complete Your Waiver</p>
                  <p className="mb-3 text-xs text-charcoal-brand/60 font-lato leading-relaxed">
                    Fill out your rental waiver online before you arrive. Saves you time at pickup.
                  </p>
                  {state.orderReferences?.[0] && (
                    <Link to={`/waiver/${state.orderReferences[0]}`} className="text-xs font-bold text-gold-brand hover:underline">
                      Start waiver →
                    </Link>
                  )}
                </div>

                {/* 2 — Find Us */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-brand text-xs font-black text-white">2</span>
                  </div>
                  <img src={locationIcon} alt="" className="mb-2 h-8 w-8 object-contain" />
                  <p className="mb-1 font-headline text-sm font-black text-charcoal-brand leading-tight">Find Us</p>
                  <p className="mb-3 text-xs text-charcoal-brand/60 font-lato leading-relaxed">
                    Tourism Rd, Catangnan, General Luna. Look for Lola's shack on the backroad.
                  </p>
                  <a
                    href="https://maps.google.com/?q=Tourism+Rd+Catangnan+General+Luna+Siargao"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-gold-brand hover:underline"
                  >
                    Get directions →
                  </a>
                </div>

                {/* 3 — Pick Up */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-brand text-xs font-black text-white">3</span>
                  </div>
                  <span className="mb-2 block text-2xl">🛵</span>
                  <p className="mb-1 font-headline text-sm font-black text-charcoal-brand leading-tight">Pick Up Your Scooter</p>
                  <p className="mb-3 text-xs text-charcoal-brand/60 font-lato leading-relaxed">
                    Show your reference number and a valid ID. We'll brief you on the bike.
                  </p>
                  {state.pickupDatetime && (
                    <p className="text-xs font-bold text-teal-brand">
                      {new Date(state.pickupDatetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}
                      {new Date(state.pickupDatetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                </div>

                {/* 4 — Explore */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-brand text-xs font-black text-white">4</span>
                  </div>
                  <span className="mb-2 block text-2xl">🏄</span>
                  <p className="mb-1 font-headline text-sm font-black text-charcoal-brand leading-tight">Explore Siargao!</p>
                  <p className="mb-3 text-xs text-charcoal-brand/60 font-lato leading-relaxed">
                    Cloud 9, Sugba Lagoon, Magpupungko — the island is yours.
                  </p>
                  <span className="text-xs font-bold text-teal-brand">Enjoy 🔥</span>
                </div>

              </div>
            </div>
          </FadeUpSection>

          {/* ── Licence note (non-tuktuk) ── */}
          {!basketHadTukRef.current && (
            <FadeUpSection>
              <div className="mt-5 rounded-2xl bg-white/60 px-5 py-4 flex items-start gap-3">
                <span className="text-xl">🪪</span>
                <p className="text-sm text-charcoal-brand/70 font-lato leading-relaxed">
                  <strong className="text-charcoal-brand">Bring your licence.</strong>{' '}
                  Please have a valid driver's licence at pickup. International licences accepted.{' '}
                  <a
                    href="https://go.idaoffers.com/aff_c?offer_id=13&aff_id=62491"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-teal-brand hover:underline"
                  >
                    Get yours online →
                  </a>
                </p>
              </div>
            </FadeUpSection>
          )}

          {/* ── Footer ── */}
          <div className="mt-8 pb-12 text-center">
            <button
              type="button"
              onClick={() => navigate('/book')}
              className="mb-4 inline-block min-h-[44px] rounded-full bg-white/70 px-8 font-headline text-base font-black text-charcoal-brand shadow-sm transition-all hover:bg-white active:scale-95"
            >
              Back to Home
            </button>
            <p className="font-lato text-sm font-bold text-charcoal-brand/60">
              Need help?{' '}
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-teal-brand underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80"
              >
                <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                Chat with Lola's Team
              </a>
            </p>
          </div>

        </div>
      </div>

      <LolasChat />
    </PageLayout>
  );
}
