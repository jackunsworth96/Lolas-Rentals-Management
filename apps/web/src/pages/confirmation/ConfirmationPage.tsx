import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useBookingStore } from '../../stores/bookingStore.js';
import { RentalSummaryCard } from '../../components/confirmation/RentalSummaryCard.js';
import { QuickTipsCard } from '../../components/confirmation/QuickTipsCard.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { HeroFloatingClouds } from '../../components/ui/HeroFloatingClouds.js';

import lolaCartoon from '../../assets/Lola Face Cartoon.svg';
import pawPrint from '../../assets/Paw Print.svg';

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
  transferType?: 'shared' | 'private' | null;
  flightNumber?: string | null;
  transferRoute?: string | null;
}

const WHATSAPP_HREF = 'https://wa.me/639171234567';

export default function ConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const clearBasket = useBookingStore((s) => s.clearBasket);

  const state = location.state as ConfirmationState | null;

  const [copied, setCopied] = useState(false);
  const [pillVisible, setPillVisible] = useState(false);

  useEffect(() => { clearBasket(); }, [clearBasket]);
  useEffect(() => {
    const t = setTimeout(() => setPillVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  if (!state || !state.orderReferences?.length) {
    return <Navigate to="/browse-book" replace />;
  }

  const refDisplay = state.orderReferences.join(' · ');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(refDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }

  return (
    <PageLayout title="Booking Confirmed | Lola's Rentals">
      <div
        className="relative -mx-4 -mt-20 min-h-screen overflow-hidden px-4 pt-20"
        style={{ background: 'linear-gradient(180deg, #FAF6F0 0%, #E8DFD0 100%)' }}
      >
        <HeroFloatingClouds variant="functional" />
        <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center pt-8 text-center">
          <div className="relative mb-12">
            <div
              className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-full bg-gold-brand p-2 shadow-2xl"
              style={{ animation: 'bounce 3s ease-in-out infinite' }}
            >
              <img src={lolaCartoon} alt="Lola" className="h-full w-full bg-transparent object-contain" />
            </div>
            <div
              className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-teal-brand px-8 py-3 font-headline text-lg font-bold text-white shadow-xl transition-all duration-500 ${
                pillVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              }`}
            >
              Booking Confirmed!
            </div>
          </div>

          <h2 className="mb-6 font-headline text-4xl font-black leading-tight tracking-tight text-teal-brand">
            See you in Siargao.
          </h2>

          <div className="mb-12 flex flex-col items-center">
            <span className="mb-2 text-xs font-bold uppercase tracking-widest text-charcoal-brand/60">Your Reference Number</span>
            <div className="flex items-center gap-3">
              <span className="border-b-4 border-gold-brand pb-1 font-headline text-3xl font-black tracking-tighter text-charcoal-brand md:text-4xl">
                {refDisplay}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-sand-brand text-charcoal-brand/60 transition-all duration-200 hover:bg-sand-brand/80 active:scale-90"
                title="Copy reference"
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

          <div className="mb-12 flex w-full justify-center">
            <img src={pawPrint} alt="" className="h-10 bg-transparent opacity-20 grayscale" />
          </div>

          <FadeUpSection>
            <RentalSummaryCard
              vehicleModelName={state.vehicleModelName} pickupDatetime={state.pickupDatetime}
              dropoffDatetime={state.dropoffDatetime} rentalDays={state.rentalDays} grandTotal={state.grandTotal}
              depositAmount={state.depositAmount} customerEmail={state.customerEmail}
              addonNames={state.addonNames ?? []} transferType={state.transferType}
              flightNumber={state.flightNumber} transferRoute={state.transferRoute}
            />
          </FadeUpSection>

          <div className="h-6" />
          <FadeUpSection><QuickTipsCard /></FadeUpSection>
          <div className="h-10" />

          <div className="flex w-full flex-col gap-4">
            <PrimaryCtaButton
              type="button" onClick={() => navigate('/browse-book')}
              className="flex min-h-[44px] w-full items-center justify-center gap-3 py-5 font-headline text-lg font-black"
            >
              Extend My Rental →
            </PrimaryCtaButton>
            <button
              type="button" onClick={() => navigate('/')}
              className="min-h-[44px] w-full rounded-full bg-cream-brand font-headline text-lg font-black text-charcoal-brand shadow-md transition-all duration-300 hover:bg-sand-brand"
            >
              Back to Home
            </button>
          </div>

          <p className="mt-12 text-sm font-bold text-charcoal-brand/60">
            Need help?{' '}
            <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="text-teal-brand underline decoration-2 underline-offset-4 transition-opacity duration-200 hover:opacity-80">
              Chat with Lola&apos;s Team
            </a>
          </p>
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
