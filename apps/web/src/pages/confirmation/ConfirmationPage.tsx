import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useBookingStore } from '../../stores/bookingStore.js';
import { RentalSummaryCard } from '../../components/confirmation/RentalSummaryCard.js';
import Stepper, { Step } from '../../components/home/Stepper.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';

import lolaVideo from '../../assets/Checkout_Lola.mp4';
import pawPrint from '../../assets/Paw Print.svg';
import { WHATSAPP_URL } from '../../config/contact.js';
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
  charityDonation?: number;
}

export default function ConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reference } = useParams<{ reference?: string }>();
  const clearBasket = useBookingStore((s) => s.clearBasket);

  const navState = location.state as ConfirmationState | null;

  const [state, setState] = useState<ConfirmationState | null>(navState);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pillVisible, setPillVisible] = useState(false);

  useEffect(() => { clearBasket(); }, [clearBasket]);
  useEffect(() => {
    const t = setTimeout(() => setPillVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state) return;
    if (!reference) { setFetchError(true); return; }

    let cancelled = false;
    setLoading(true);
    api.get<ConfirmationState>(`/public/booking/order/${encodeURIComponent(reference)}`)
      .then((data) => { if (!cancelled) setState(data); })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state, reference]);

  if (loading) {
    return (
      <PageLayout title="Loading... | Lola's Rentals" showFloralRight={false}>
        <div className="flex min-h-[60vh] items-center justify-center">
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
          <p className="mb-8 text-charcoal-brand/60">We could not find a booking with that reference. It may have been processed already.</p>
          <PrimaryCtaButton type="button" onClick={() => navigate('/book/reserve')} className="px-10 py-4 font-bold">
            Browse Vehicles
          </PrimaryCtaButton>
        </div>
      </PageLayout>
    );
  }

  if (!state) return null;

  const refDisplay = state.orderReferences.join(' · ');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(refDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }

  return (
    <PageLayout title="Booking Confirmed | Lola's Rentals" showFloralRight={false}>
      <div
        className="relative -mx-4 -mt-20 min-h-screen overflow-hidden px-4 pt-20"
        style={{ backgroundColor: '#f1e6d6' }}
      >
        <HeroFloatingClouds variant="editorial" />
        <div className="relative z-10 mx-auto max-w-4xl pt-4">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

            {/* LEFT — hero identity (sticky on desktop) */}
            <div className="flex flex-col items-center text-center md:sticky md:top-8 md:self-start">
              <div className="relative pb-10">
                <div
                  className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full"
                  style={{ animation: 'bounce 3s ease-in-out infinite' }}
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
                <div
                  className={`font-lato absolute left-1/2 top-[88%] -mt-4 -translate-x-1/2 whitespace-nowrap transition-all duration-500 ${
                    pillVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                  }`}
                  style={{
                    backgroundColor: '#FCBC5A',
                    color: '#363737',
                    border: '2px solid #363737',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '16px',
                    letterSpacing: '0.02em',
                    boxShadow: '4px 4px 0 #363737',
                    padding: '10px 24px',
                  }}
                >
                  Booking Confirmed!
                </div>
              </div>

              <h2 className="mt-3 mb-2 font-headline text-4xl font-black leading-tight tracking-tight text-teal-brand">
                See you in Siargao.
              </h2>

              <div className="mb-4 flex flex-col items-center">
                <span
                  className="font-lato mb-1.5 text-charcoal-brand/60"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Your Reference Number
                </span>
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="font-lato font-black"
                    style={{
                      fontSize: 'clamp(28px, 6vw, 36px)',
                      letterSpacing: '0.15em',
                      color: '#363737',
                      borderBottom: '4px solid #FCBC5A',
                      paddingBottom: '4px',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-all',
                      maxWidth: '100%',
                    }}
                  >
                    {refDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full bg-sand-brand text-sm text-charcoal-brand/60 transition-all duration-200 hover:bg-sand-brand/80 active:scale-90"
                    title="Copy reference"
                    aria-label="Copy reference number"
                  >
                    {copied ? '✓' : '📋'}
                    {copied && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-teal-brand px-3 py-1 text-[10px] font-bold text-white shadow-md animate-fade-up">
                        Copied!
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="mb-3 flex w-full justify-center">
                <img src={pawPrint} alt="" className="h-8 bg-transparent opacity-20 grayscale" />
              </div>

              {(state.charityDonation ?? 0) > 0 && (
                <FadeUpSection>
                  <div className="mb-4 w-full rounded-[2rem] bg-teal-brand/10 px-5 py-4 text-center">
                    <p className="font-headline text-lg font-bold text-teal-brand">
                      Thank you for your ₱{(state.charityDonation ?? 0).toLocaleString()} donation to BePawsitive 🐾
                    </p>
                    <p className="font-lato mt-1 text-sm text-charcoal-brand/60">
                      You're helping animals on Siargao!
                    </p>
                  </div>
                </FadeUpSection>
              )}
            </div>

            {/* RIGHT — booking details */}
            <div className="flex flex-col">
              <FadeUpSection>
                <RentalSummaryCard
                  vehicleModelName={state.vehicleModelName} pickupDatetime={state.pickupDatetime}
                  dropoffDatetime={state.dropoffDatetime} rentalDays={state.rentalDays} grandTotal={state.grandTotal}
                  customerEmail={state.customerEmail}
                  addonNames={state.addonNames ?? []} transferType={state.transferType}
                  flightNumber={state.flightNumber} transferRoute={state.transferRoute}
                  charityDonation={state.charityDonation}
                />
              </FadeUpSection>
            </div>

          </div>

          {/* FULL WIDTH — tips + actions */}
          <div className="mt-8">
            <FadeUpSection>
              <Stepper initialStep={1} backButtonText="Back" nextButtonText="Next">
                <Step>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>💰</span>
                    <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                      Cash Deposit at Pickup
                    </h4>
                    <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                      Bring ₱{state.vehicleModelName?.toLowerCase().includes('tuktuk') ? '2,000' : '1,000'} cash for your refundable security deposit. This is returned when you drop off.
                    </p>
                  </div>
                </Step>
                <Step>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <img
                      src={locationIcon}
                      alt=""
                      className="mx-auto mb-4 h-14 w-14 object-contain"
                      width={56}
                      height={56}
                    />
                    <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                      Find Us
                    </h4>
                    <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                      General Luna, near Cloud 9. Look for the teal Lola&apos;s shack! Our team will be ready for you.
                    </p>
                  </div>
                </Step>
                <Step>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>🪪</span>
                    <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                      Bring Your Licence
                    </h4>
                    <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                      Please have a valid driver&apos;s licence ready at pickup. International licences are accepted.
                    </p>
                  </div>
                </Step>
                <Step>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>⛑️</span>
                    <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                      Gear Included
                    </h4>
                    <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                      Two sanitised helmets and a full tank of fuel are included with every rental. You&apos;re all set.
                    </p>
                  </div>
                </Step>
                <Step>
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>🐾</span>
                    <h4 className="font-headline font-bold" style={{ fontSize: 20, color: '#00577C', marginBottom: 8 }}>
                      You&apos;re Paw Card Family
                    </h4>
                    <p className="font-lato" style={{ fontSize: 15, color: '#363737', lineHeight: 1.6, opacity: 0.8 }}>
                      Every rental helps feed and neuter street animals on Siargao through our BePawsitive partnership.
                    </p>
                  </div>
                </Step>
              </Stepper>
            </FadeUpSection>

            <div className="mt-6 max-w-xs mx-auto">
              <button
                type="button"
                onClick={() => navigate('/book')}
                className="min-h-[44px] w-full rounded-full bg-cream-brand font-headline text-lg font-black text-charcoal-brand shadow-md transition-all duration-300 hover:bg-sand-brand"
              >
                Back to Home
              </button>
            </div>

            <p className="font-lato mt-6 mb-8 text-center text-sm font-bold text-charcoal-brand/60">
              Need help?{' '}
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-teal-brand underline decoration-2 underline-offset-4 transition-opacity duration-200 hover:opacity-80"
              >
                <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
                Chat with Lola&apos;s Team
              </a>
            </p>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </PageLayout>
  );
}
